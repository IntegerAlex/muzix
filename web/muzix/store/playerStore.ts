import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Song, QueueItem } from '@/services/types';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { safeStorage } from '@/store/storage';
import { queueDepth } from '@/services/metrics';
import { enqueueRequest } from '@/services/offlineQueue';
import { isOnline } from '@/services/networkStatus';

export type RepeatMode = 'off' | 'all' | 'one';

const QUEUE_STORAGE_KEY = 'muzix-queue';

// ---------------------------------------------------------------------------
// Unique queue-slot identifier. Collides ~never for any realistic queue size.
// ---------------------------------------------------------------------------
export function generateQueueItemId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/** Wrap a plain Song into a QueueItem with a fresh slot ID. */
function toQueueItem(song: Song): QueueItem {
  return { ...song, queueItemId: generateQueueItemId() };
}

/**
 * Accept either Song[] (from album/playlist screens) or QueueItem[] (from
 * restore / internal copies). Returns a proper QueueItem[].
 */
function ensureQueueItems(songs: (Song | QueueItem)[]): QueueItem[] {
  return songs.map((s) => ('queueItemId' in s ? (s as QueueItem) : toQueueItem(s)));
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveQueue(state: { queue: QueueItem[]; currentIndex: number; shuffle: boolean; repeat: RepeatMode }) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const data = {
        queue: state.queue.map((s) => ({ ...s })),
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
      };
      await safeStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, 500);
}

export async function restoreQueue(): Promise<{ queue: QueueItem[]; currentIndex: number } | null> {
  try {
    const raw = await safeStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Accept both old Song[] format (no queueItemId) and new QueueItem[] format.
    const queue: QueueItem[] = Array.isArray(parsed.queue)
      ? parsed.queue
          .filter((s: unknown): s is Song => !!s && typeof s === 'object' && typeof (s as Song).id === 'string')
          .map((s: Song) => ('queueItemId' in s ? (s as QueueItem) : toQueueItem(s)))
      : [];
    if (queue.length === 0) return null;
    return { queue, currentIndex: parsed.currentIndex ?? 0 };
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface PlayerState {
  current: Song | null;
  queue: QueueItem[];
  originalQueue: QueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  loadingId: string | null;
  showNowPlaying: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  history: number[];
  likedSongs: Record<string, boolean>;
  error: string | null;
  volume: number;
  seekPosition: number | null;
  positionMs: number;
  durationSec: number;
  connectionStatus: 'online' | 'offline';
  totalPlays: number;
  totalListeningMs: number;
  recentlyPlayed: string[];

  /**
   * Start playing a song.
   * `queue` may be Song[] (from list screens) or QueueItem[] (internal).
   * Each element will be wrapped into a QueueItem if it isn't one already.
   */
  playSong: (song: Song, queue?: (Song | QueueItem)[], index?: number) => void;
  setPlaying: (v: boolean) => void;
  setLoading: (id: string | null) => void;
  setShowNowPlaying: (v: boolean) => void;
  next: () => void;
  previous: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (songId: string) => void;
  syncLikes: () => Promise<void>;
  syncRecent: () => Promise<void>;
  /** Append a song to the end of the queue. */
  addToQueue: (song: Song) => void;
  /** Insert a song immediately after the currently playing track. */
  playNext: (song: Song) => void;
  /** Remove the queue slot identified by its unique queueItemId. */
  removeFromQueue: (queueItemId: string) => void;
  /** Move a queue slot from one index to another (used by drag-and-drop). */
  reorderQueue: (from: number, to: number) => void;
  clearQueue: () => void;
  shuffleQueue: () => void;
  removeHistoryTop: () => void;
  setVolume: (v: number) => void;
  setSeekPosition: (v: number | null) => void;
  setPlaybackPosition: (positionMs: number, durationSec: number) => void;
  setConnectionStatus: (status: 'online' | 'offline') => void;
  retry: () => void;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function patchLyrics(song: Song): Promise<void> {
  if (song.lyrics) return;
  try {
    const full = await api.song(song.id);
    const lyrics = full.lyrics ?? undefined;
    if (lyrics) {
      usePlayerStore.setState((state) =>
        state.current?.id === song.id ? { current: { ...state.current!, lyrics } } : {}
      );
    }
  } catch (e) {
    console.warn('Failed to fetch lyrics for', song.title, e);
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      current: null,
      queue: [],
      originalQueue: [],
      currentIndex: -1,
      isPlaying: false,
      loadingId: null,
      showNowPlaying: false,
      shuffle: false,
      repeat: 'off',
      history: [],
      likedSongs: {},
      volume: 0.7,
      seekPosition: null,
      positionMs: 0,
      durationSec: 0,
      error: null,
      connectionStatus: 'online',
      totalPlays: 0,
      totalListeningMs: 0,
      recentlyPlayed: [],

      playSong: (song, queue, index) => {
        const nextQueue: QueueItem[] = queue
          ? ensureQueueItems(queue)
          : get().queue.length
          ? get().queue
          : [toQueueItem(song)];

        // Find the slot index. Prefer the explicit index; fall back to
        // finding the first slot whose underlying song.id matches.
        let resolvedIndex =
          index != null
            ? index
            : nextQueue.findIndex((s) => s.id === song.id);
        if (resolvedIndex < 0) resolvedIndex = 0;

        const recent = get().recentlyPlayed;
        const deduped = [song.id, ...recent.filter((id) => id !== song.id)].slice(0, 50);

        set({
          current: song,
          queue: nextQueue,
          originalQueue: queue ? nextQueue : get().originalQueue,
          currentIndex: resolvedIndex,
          isPlaying: true,
          history: [],
          error: null,
          totalPlays: get().totalPlays + 1,
          totalListeningMs: get().totalListeningMs + song.durationMs,
          recentlyPlayed: deduped,
        });
        patchLyrics(song);
        saveQueue({ queue: nextQueue, currentIndex: resolvedIndex, shuffle: get().shuffle, repeat: get().repeat });
      },

      setPlaying: (v) => {
        set({ isPlaying: v, error: null });
      },

      setLoading: (id) => set({ loadingId: id }),

      setShowNowPlaying: (v) => set({ showNowPlaying: v }),

      next: () => {
        const { currentIndex, queue, repeat } = get();
        const ni = currentIndex + 1;

        if (ni >= queue.length) {
          if (repeat === 'all') {
            const item = queue[0];
            if (!item) return;
            set({ current: item, currentIndex: 0, history: [...get().history, currentIndex], error: null, totalPlays: get().totalPlays + 1, totalListeningMs: get().totalListeningMs + item.durationMs });
            patchLyrics(item);
            return;
          }
          if (repeat === 'one') {
            const item = queue[currentIndex];
            if (!item) return;
            set({ history: [...get().history, currentIndex], error: null });
            patchLyrics(item);
            return;
          }
          if (queue.length === 0) {
            set({ current: null, currentIndex: -1, isPlaying: false, error: null });
            return;
          }
          set({ isPlaying: false, error: null });
          return;
        }

        const item = queue[ni];
        set({ current: item, currentIndex: ni, history: [...get().history, currentIndex], error: null, totalPlays: get().totalPlays + 1, totalListeningMs: get().totalListeningMs + item.durationMs });
        patchLyrics(item);
      },

      previous: () => {
        const { history, queue, currentIndex } = get();
        if (queue.length === 0) return;
        if (history.length > 0) {
          const newHistory = [...history];
          const prevIndex = newHistory.pop()!;
          const item = queue[prevIndex];
          if (item) {
            set({ current: item, currentIndex: prevIndex, history: newHistory, error: null });
            patchLyrics(item);
            return;
          }
        }
        const pi = Math.max(0, currentIndex - 1);
        const item = queue[pi];
        if (!item) return;
        set({ current: item, currentIndex: pi, error: null });
        patchLyrics(item);
      },

      toggleShuffle: () => {
        const { shuffle, queue, originalQueue, currentIndex, current } = get();
        if (!shuffle) {
          const remaining = queue.filter((_, i) => i !== currentIndex);
          const shuffled = shuffleArray(remaining);
          // Keep the current QueueItem in slot 0 so its queueItemId is preserved.
          const newQueue = current
            ? [queue[currentIndex] ?? toQueueItem(current), ...shuffled]
            : shuffled;
          set({ shuffle: true, queue: newQueue, currentIndex: 0, history: [] });
          saveQueue({ queue: newQueue, currentIndex: 0, shuffle: true, repeat: get().repeat });
        } else {
          const newIndex = current
            ? originalQueue.findIndex((s) => s.id === current.id)
            : 0;
          const resolvedIndex = newIndex >= 0 ? newIndex : 0;
          set({ shuffle: false, queue: originalQueue, currentIndex: resolvedIndex });
          saveQueue({ queue: originalQueue, currentIndex: resolvedIndex, shuffle: false, repeat: get().repeat });
        }
      },

      toggleRepeat: () => {
        const { repeat } = get();
        const next: RepeatMode = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
        set({ repeat: next });
      },

      toggleLike: (songId) => {
        const { likedSongs } = get();
        const wasLiked = !!likedSongs[songId];
        set({ likedSongs: { ...likedSongs, [songId]: !wasLiked } });
        const token = useAuthStore.getState().token;
        if (token) {
          if (!isOnline()) {
            const method = wasLiked ? 'DELETE' : 'POST';
            enqueueRequest(`/likes/${songId}`, method);
            return;
          }
          const apiCall = wasLiked ? api.unlike : api.like;
          apiCall(songId, token).catch(() => {
            set((s) => ({ likedSongs: { ...s.likedSongs, [songId]: wasLiked } }));
          });
        }
      },

      syncLikes: async () => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        try {
          const { songIds } = await api.getLikes(token);
          set({ likedSongs: Object.fromEntries(songIds.map((id) => [id, true])) });
        } catch {}
      },

      syncRecent: async () => {
        const token = useAuthStore.getState().token;
        if (!token) return;
        try {
          const res = await api.recentActivity(50, token);
          const items: any[] = res?.items ?? [];
          const ids = items
            .map((item: any) => item.song_id ?? item.song?.id)
            .filter(Boolean) as string[];
          if (ids.length > 0) {
            const existing = get().recentlyPlayed;
            const merged = [...new Set([...ids, ...existing])].slice(0, 50);
            set({ recentlyPlayed: merged });
          }
        } catch {}
      },

      addToQueue: (song) => {
        const { queue } = get();
        const newQueue = [...queue, toQueueItem(song)];
        set({ queue: newQueue });
        saveQueue({ queue: newQueue, currentIndex: get().currentIndex, shuffle: get().shuffle, repeat: get().repeat });
        queueDepth(newQueue.length);
      },

      playNext: (song) => {
        const { queue, currentIndex } = get();
        const newQueue = [...queue];
        newQueue.splice(currentIndex + 1, 0, toQueueItem(song));
        set({ queue: newQueue });
        saveQueue({ queue: newQueue, currentIndex: get().currentIndex, shuffle: get().shuffle, repeat: get().repeat });
        queueDepth(newQueue.length);
      },

      removeFromQueue: (queueItemId) => {
        const { queue, currentIndex } = get();
        const index = queue.findIndex((s) => s.queueItemId === queueItemId);
        if (index < 0) return;

        const newQueue = queue.filter((_, i) => i !== index);
        if (newQueue.length === 0) {
          set({ queue: [], currentIndex: -1, current: null, isPlaying: false });
          saveQueue({ queue: [], currentIndex: -1, shuffle: get().shuffle, repeat: get().repeat });
          return;
        }

        let newIndex = currentIndex;
        if (index < currentIndex) {
          newIndex = currentIndex - 1;
        } else if (index === currentIndex) {
          newIndex = Math.min(currentIndex, newQueue.length - 1);
        }
        const newCurrent = newQueue[newIndex] ?? null;
        set({ queue: newQueue, currentIndex: newIndex, current: newCurrent });
        if (newCurrent) patchLyrics(newCurrent);
        saveQueue({ queue: newQueue, currentIndex: newIndex, shuffle: get().shuffle, repeat: get().repeat });
      },

      reorderQueue: (from, to) => {
        const { queue, currentIndex } = get();
        if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return;
        const newQueue = [...queue];
        const [moved] = newQueue.splice(from, 1);
        newQueue.splice(to, 0, moved);
        let newIndex = currentIndex;
        if (from === currentIndex) {
          newIndex = to;
        } else if (from < currentIndex && to >= currentIndex) {
          newIndex = currentIndex - 1;
        } else if (from > currentIndex && to <= currentIndex) {
          newIndex = currentIndex + 1;
        }
        set({ queue: newQueue, currentIndex: newIndex });
        saveQueue({ queue: newQueue, currentIndex: newIndex, shuffle: get().shuffle, repeat: get().repeat });
      },

      clearQueue: () => {
        set({ queue: [], currentIndex: -1, current: null, isPlaying: false });
        saveQueue({ queue: [], currentIndex: -1, shuffle: get().shuffle, repeat: get().repeat });
      },

      shuffleQueue: () => {
        const { queue, currentIndex, current } = get();
        if (queue.length <= 1) return;
        const before = current ? [queue[currentIndex] ?? toQueueItem(current)] : [];
        const rest = queue.filter((_, i) => i !== currentIndex);
        const shuffled = shuffleArray(rest);
        const newQueue = [...before, ...shuffled];
        const newIndex = current ? 0 : 0;
        set({ queue: newQueue, currentIndex: newIndex, shuffle: true, history: [] });
        saveQueue({ queue: newQueue, currentIndex: newIndex, shuffle: true, repeat: get().repeat });
      },

      removeHistoryTop: () => {
        const { history } = get();
        if (history.length === 0) return;
        set({ history: history.slice(0, -1) });
      },

      setVolume: (v) => {
        set({ volume: v });
      },

      setSeekPosition: (v) => {
        set({ seekPosition: v });
      },

      setPlaybackPosition: (positionMs, durationSec) => {
        set({ positionMs, durationSec });
      },

      setConnectionStatus: (status) => set({ connectionStatus: status }),

      retry: () => {
        const { current } = get();
        if (!current) return;
        set({ error: null, loadingId: current.id });
      },
    }),
    {
      name: 'player-liked-songs',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        likedSongs: state.likedSongs,
        recentlyPlayed: state.recentlyPlayed,
        totalPlays: state.totalPlays,
        totalListeningMs: state.totalListeningMs,
      }),
    }
  )
);
