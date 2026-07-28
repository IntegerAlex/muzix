import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { api, ApiError } from '@/services/api';
import { downloadToCache } from '@/services/cache';
import { usePlayerStore } from '@/store/playerStore';
import { useAuthStore } from '@/store/authStore';

const IS_WEB = Platform.OS === 'web';
const RNTP_OWNS_AUDIO = !IS_WEB;

const SESSION_ID = Math.random().toString(36).substring(2, 15);

interface TelemetryEvent {
  song_id: string;
  session_id: string;
  event_type: 'play' | 'pause' | 'complete' | 'skip' | 'seek';
  started_at: string;
  ended_at: string | null;
  duration_played_ms: number;
  song_duration_ms: number | null;
  completion_percentage: number;
  source: string | null;
  source_id: string | null;
  position_in_queue: number | null;
  device_type: string;
  app_version: string | null;
}

const EVENT_BUFFER: TelemetryEvent[] = [];
const BUFFER_MAX_SIZE = 50;
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let flushRetries = 0;
const MAX_FLUSH_RETRIES = 3;

async function flushEvents() {
  if (EVENT_BUFFER.length === 0) return;
  const eventsToSend = EVENT_BUFFER.splice(0, EVENT_BUFFER.length);
  try {
    await fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'}/telemetry/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventsToSend),
    });
    flushRetries = 0;
  } catch {
    flushRetries++;
    if (flushRetries < MAX_FLUSH_RETRIES) {
      EVENT_BUFFER.unshift(...eventsToSend);
      if (EVENT_BUFFER.length > BUFFER_MAX_SIZE) EVENT_BUFFER.length = BUFFER_MAX_SIZE;
    }
    // else: discard events after max retries to prevent infinite loop
  }
  if (flushTimeout) clearTimeout(flushTimeout);
  if (EVENT_BUFFER.length > 0 || flushRetries < MAX_FLUSH_RETRIES) {
    flushTimeout = setTimeout(flushEvents, 10000);
  } else {
    flushTimeout = null;
  }
}

function recordEvent(event: Omit<TelemetryEvent, 'device_type' | 'app_version' | 'source' | 'source_id' | 'position_in_queue'>) {
  EVENT_BUFFER.push({ ...event, source: null, source_id: null, position_in_queue: null, device_type: 'web', app_version: '1.0.0' });
  if (EVENT_BUFFER.length >= BUFFER_MAX_SIZE) { if (flushTimeout) clearTimeout(flushTimeout); flushEvents(); }
  else if (!flushTimeout) { flushTimeout = setTimeout(flushEvents, 10000); }
}

let sessionStarted = false;
function recordSessionStart() {
  if (sessionStarted) return;
  sessionStarted = true;
  fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'}/telemetry/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION_ID, device_type: 'web', app_version: '1.0.0', entry_source: 'app_open' }),
  }).catch(() => {});
}

function recordSessionEnd(exitReason = 'user_close') {
  fetch(`${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'}/telemetry/session/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION_ID, exit_reason: exitReason }),
  }).catch(() => {});
  if (EVENT_BUFFER.length > 0) flushEvents();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => recordSessionEnd('user_close'));
  window.addEventListener('pagehide', () => recordSessionEnd('background'));
}

const preloadCache = new Map<string, HTMLAudioElement>();

function preloadNextTrack(url: string) {
  if (!IS_WEB) return;
  if (preloadCache.has(url)) return;
  try {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.src = url;
    audio.load();
    preloadCache.set(url, audio);
    if (preloadCache.size > 3) {
      const oldest = preloadCache.keys().next().value;
      if (oldest) preloadCache.delete(oldest);
    }
  } catch {}
}

function releasePreloaded(url: string) {
  const audio = preloadCache.get(url);
  if (audio) {
    audio.pause();
    audio.src = '';
    preloadCache.delete(url);
  }
}

export function PlayerBridge() {
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);

  const current = usePlayerStore((s) => s.current);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const volume = usePlayerStore((s) => s.volume);
  const seekPosition = usePlayerStore((s) => s.seekPosition);
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setLoading = usePlayerStore((s) => s.setLoading);
  const setSeekPosition = usePlayerStore((s) => s.setSeekPosition);

  const lastPlayedMsRef = useRef(0);
  const playStartRef = useRef<Date | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  useEffect(() => { recordSessionStart(); }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      import('@/services/playerService').then(ps => ps.setupPlayer?.());
    }
  }, []);

  useEffect(() => {
    if (RNTP_OWNS_AUDIO) return;
    if (!current) return;
    let cancelled = false;
    retryCountRef.current = 0;

    const attemptLoad = async () => {
      setLoading(current.id);
      try {
        const token = useAuthStore.getState().token;
        const { url } = await api.stream(current.id, token ?? undefined);
        if (cancelled) return;
        const playUri = IS_WEB ? url : await downloadToCache(current.id, url);
        if (cancelled) return;

        if (currentUrlRef.current && IS_WEB) releasePreloaded(currentUrlRef.current);
        currentUrlRef.current = playUri;

        player.replace({ uri: playUri });
        player.play();
        setPlaying(true);
        playStartRef.current = new Date();
        retryCountRef.current = 0;
        usePlayerStore.setState({ error: null });
        recordEvent({ song_id: current.id, session_id: SESSION_ID, event_type: 'play', started_at: new Date().toISOString(), ended_at: null, duration_played_ms: 0, song_duration_ms: current.durationMs, completion_percentage: 0 });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setPlaying(false);
          setLoading(null);
          useAuthStore.getState().logout();
          router.replace('/login');
          return;
        }
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setTimeout(() => { if (!cancelled) attemptLoad(); }, 1000 * retryCountRef.current);
          return;
        }
        setPlaying(false);
        usePlayerStore.setState({ error: 'Playback failed. Tap retry to try again.' });
      } finally {
        if (!cancelled) setLoading(null);
      }
    };

    attemptLoad();
    return () => { cancelled = true; };
  }, [current?.id, player, setLoading, setPlaying]);

  useEffect(() => {
    if (RNTP_OWNS_AUDIO) return;
    if (!current) return;
    try {
      if (isPlaying && !status.playing) player.play();
      if (!isPlaying && status.playing) player.pause();
    } catch {}
  }, [isPlaying, status.playing, current, player]);

  const prevIsPlayingRef = useRef(isPlaying);
  useEffect(() => {
    if (RNTP_OWNS_AUDIO || !current) return;
    if (prevIsPlayingRef.current !== isPlaying) {
      if (isPlaying) {
        playStartRef.current = new Date();
        recordEvent({ song_id: current.id, session_id: SESSION_ID, event_type: 'play', started_at: new Date().toISOString(), ended_at: null, duration_played_ms: lastPlayedMsRef.current, song_duration_ms: current.durationMs, completion_percentage: current.durationMs > 0 ? Math.round((lastPlayedMsRef.current / current.durationMs) * 100) : 0 });
      } else {
        const now = new Date();
        const playedMs = playStartRef.current ? now.getTime() - playStartRef.current.getTime() : 0;
        lastPlayedMsRef.current += playedMs;
        playStartRef.current = null;
        recordEvent({ song_id: current.id, session_id: SESSION_ID, event_type: 'pause', started_at: now.toISOString(), ended_at: now.toISOString(), duration_played_ms: playedMs, song_duration_ms: current.durationMs, completion_percentage: current.durationMs > 0 ? Math.round((lastPlayedMsRef.current / current.durationMs) * 100) : 0 });
      }
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, current]);

  const didJustFinishRef = useRef(status.didJustFinish);
  useEffect(() => {
    if (RNTP_OWNS_AUDIO) return;
    if (status.didJustFinish && current && !didJustFinishRef.current) {
      didJustFinishRef.current = true;
      recordEvent({ song_id: current.id, session_id: SESSION_ID, event_type: 'complete', started_at: new Date().toISOString(), ended_at: new Date().toISOString(), duration_played_ms: current.durationMs, song_duration_ms: current.durationMs, completion_percentage: 100 });
      usePlayerStore.getState().next();
    } else if (!status.didJustFinish) {
      didJustFinishRef.current = false;
    }
  }, [status.didJustFinish, current]);

  const lastSeekRef = useRef(seekPosition);
  useEffect(() => {
    if (RNTP_OWNS_AUDIO || seekPosition == null || !current || seekPosition === lastSeekRef.current) return;
    lastSeekRef.current = seekPosition;
    recordEvent({ song_id: current.id, session_id: SESSION_ID, event_type: 'seek', started_at: new Date().toISOString(), ended_at: new Date().toISOString(), duration_played_ms: 0, song_duration_ms: current.durationMs, completion_percentage: current.durationMs > 0 ? Math.round((seekPosition / current.durationMs) * 100) : 0 });
    const clampedFraction = Math.max(0, Math.min(seekPosition, 1));
    player.seekTo((clampedFraction * (current.durationMs ?? 0)) / 1000);
    setSeekPosition(null);
  }, [seekPosition, current, player, setSeekPosition]);

  useEffect(() => {
    if (RNTP_OWNS_AUDIO) return;
    try {
      player.volume = volume;
    } catch {}
  }, [volume, player]);

  useEffect(() => {
    if (RNTP_OWNS_AUDIO || IS_WEB || !current || !status.duration) return;
    if (status.currentTime >= status.duration * 0.8) {
      const nextIdx = currentIndex + 1;
      if (nextIdx < queue.length) {
        const nextSong = queue[nextIdx];
        if (nextSong?.audioUrl) preloadNextTrack(nextSong.audioUrl as string);
      }
    }
  }, [status.currentTime, status.duration, current, queue, currentIndex]);

  return null;
}
