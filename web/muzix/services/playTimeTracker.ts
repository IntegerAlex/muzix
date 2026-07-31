import { safeStorage } from '@/store/storage';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';

const STORAGE_KEY = 'muzix-playtime';
const FLUSH_INTERVAL_MS = 30_000;

interface SongPlayRecord {
  totalMs: number;
  flushedMs: number;
}

interface PlayTimeState {
  records: Record<string, SongPlayRecord>;
}

async function loadState(): Promise<PlayTimeState> {
  try {
    const raw = await safeStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { records: {} };
  } catch {
    return { records: {} };
  }
}

async function saveState(state: PlayTimeState): Promise<void> {
  try {
    await safeStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function ensureRecord(state: PlayTimeState, songId: string): SongPlayRecord {
  if (!state.records[songId]) {
    state.records[songId] = { totalMs: 0, flushedMs: 0 };
  }
  return state.records[songId];
}

let trackRef: { songId: string | null; since: number | null } = { songId: null, since: null };
let flushTimer: ReturnType<typeof setInterval> | null = null;

export async function startPlaying(songId: string): Promise<void> {
  const state = await loadState();
  ensureRecord(state, songId);
  trackRef.songId = songId;
  trackRef.since = Date.now();
  await saveState(state);
}

export async function pausePlaying(): Promise<void> {
  if (!trackRef.songId || trackRef.since === null) return;
  const state = await loadState();
  const rec = ensureRecord(state, trackRef.songId);
  const elapsed = Date.now() - trackRef.since;
  rec.totalMs += elapsed;
  trackRef.since = null;
  await saveState(state);
  await flushDelta(trackRef.songId);
  trackRef.songId = null;
}

export async function handleSeek(): Promise<void> {
  await pausePlaying();
}

export async function flushDelta(songId?: string): Promise<void> {
  const state = await loadState();
  const ids = songId ? [songId] : Object.keys(state.records);
  for (const id of ids) {
    if (trackRef.songId === id && trackRef.since !== null) {
      const rec = ensureRecord(state, id);
      const elapsed = Date.now() - trackRef.since;
      rec.totalMs += elapsed;
      trackRef.since = Date.now();
    }
    const rec = state.records[id];
    if (!rec || rec.totalMs === rec.flushedMs) continue;
    const delta = rec.totalMs - rec.flushedMs;
    const token = useAuthStore.getState().token;
    if (!token) continue;
    try {
      await api.recordDuration(id, delta, token);
      rec.flushedMs = rec.totalMs;
      await saveState(state);
    } catch {
      // Leave flushedMs unchanged; delta will be retried on next flush
    }
  }
}

export function startPeriodicFlush(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    flushDelta();
  }, FLUSH_INTERVAL_MS);
}

export function stopPeriodicFlush(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}