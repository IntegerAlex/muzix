import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Song } from '@/services/types';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { safeStorage } from '@/store/storage';

export type RepeatMode = 'off' | 'all' | 'one';

const QUEUE_STORAGE_KEY = 'muzix-queue';

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveQueue(state: { queue: Song[]; currentIndex: number; shuffle: boolean; repeat: RepeatMode }) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const data = {
        queue: state.queue.map(s => s.id),
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
      };
      await safeStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, 500);
}

async function restoreQueue(): Promise<{ queueIds: string[]; currentIndex: number } | null> {
  try {
    const raw = await safeStorage.getItem(QUEUE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

interface PlayerState {
  current: Song | null;
  queue: Song[];
  originalQueue: Song[];
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

  playSong: (song: Song, queue?: Song[], index?: number) => void;
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
  addToQueue: (song: Song) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;
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
        const nextQueue = queue ?? get().queue;
        const nextIndex =
          index != null
            ? index
            : nextQueue.findIndex((s) => s.id === song.id);
        const resolvedIndex = nextIndex >= 0 ? nextIndex : 0;
        const resolvedQueue = nextQueue.length ? nextQueue : [song];
        const recent = get().recentlyPlayed;
        const deduped = [song.id, ...recent.filter((id) => id !== song.id)].slice(0, 50);
        set({
          current: song,
          queue: resolvedQueue,
          originalQueue: queue ? resolvedQueue : get().originalQueue,
          currentIndex: resolvedIndex,
          isPlaying: true,
          history: [],
          error: null,
          totalPlays: get().totalPlays + 1,
          totalListeningMs: get().totalListeningMs + song.durationMs,
          recentlyPlayed: deduped,
        });
        patchLyrics(song);
        saveQueue({ queue: resolvedQueue, currentIndex: resolvedIndex, shuffle: get().shuffle, repeat: get().repeat });
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
            const song = queue[0];
            if (!song) return;
            set({ current: song, currentIndex: 0, history: [...get().history, currentIndex], error: null, totalPlays: get().totalPlays + 1, totalListeningMs: get().totalListeningMs + song.durationMs });
            patchLyrics(song);
            return;
          }
          if (repeat === 'one') {
            const song = queue[currentIndex];
            if (!song) return;
            set({ history: [...get().history, currentIndex], error: null });
            patchLyrics(song);
            return;
          }
          set({ current: null, currentIndex: -1, isPlaying: false, error: null });
          return;
        }

        const song = queue[ni];
        set({ current: song, currentIndex: ni, history: [...get().history, currentIndex], error: null, totalPlays: get().totalPlays + 1, totalListeningMs: get().totalListeningMs + song.durationMs });
        patchLyrics(song);
      },

      previous: () => {
        const { history, queue, currentIndex } = get();
        if (queue.length === 0) return;
        if (history.length > 0) {
          const newHistory = [...history];
          const prevIndex = newHistory.pop()!;
          const song = queue[prevIndex];
          if (song) {
            set({ current: song, currentIndex: prevIndex, history: newHistory, error: null });
            patchLyrics(song);
            return;
          }
        }
        const pi = Math.max(0, currentIndex - 1);
        const song = queue[pi];
        if (!song) return;
        set({ current: song, currentIndex: pi, error: null });
        patchLyrics(song);
      },

      toggleShuffle: () => {
        const { shuffle, queue, originalQueue, currentIndex, current } = get();
        if (!shuffle) {
          const remaining = queue.filter((_, i) => i !== currentIndex);
          const shuffled = shuffleArray(remaining);
          const newQueue = current ? [current, ...shuffled] : shuffled;
          set({
            shuffle: true,
            queue: newQueue,
            currentIndex: 0,
            history: [],
          });
          saveQueue({ queue: newQueue, currentIndex: 0, shuffle: true, repeat: get().repeat });
        } else {
          const newIndex = current ? originalQueue.findIndex((s) => s.id === current.id) : 0;
          const resolvedIndex = newIndex >= 0 ? newIndex : 0;
          set({
            shuffle: false,
            queue: originalQueue,
            currentIndex: resolvedIndex,
          });
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
        const newQueue = [...queue, song];
        set({ queue: newQueue });
        saveQueue({ queue: newQueue, currentIndex: get().currentIndex, shuffle: get().shuffle, repeat: get().repeat });
      },

      playNext: (song) => {
        const { queue, currentIndex } = get();
        const newQueue = [...queue];
        newQueue.splice(currentIndex + 1, 0, song);
        set({ queue: newQueue });
        saveQueue({ queue: newQueue, currentIndex: get().currentIndex, shuffle: get().shuffle, repeat: get().repeat });
      },

      removeFromQueue: (index) => {
        const { queue, currentIndex } = get();
        if (index < 0 || index >= queue.length) return;
        const newQueue = queue.filter((_, i) => i !== index);
        if (newQueue.length === 0) {
          set({ queue: [], currentIndex: -1, current: null, isPlaying: false });
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
        const before = current ? [current] : [];
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
        const { current, queue, currentIndex } = get();
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
