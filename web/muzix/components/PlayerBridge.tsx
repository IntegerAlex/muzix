import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import { ApiError } from '@/services/api';
import { resolveAudio } from '@/services/audioSource';
import { usePlayerStore } from '@/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { API_URL } from '@/lib/config';
import { trackPlay } from '@/services/metrics';
import {
  activateLockScreen,
  updateLockScreenMetadata,
  clearLockScreenControls,
  useAppStateAudioSync,
  setActivePlayer,
} from '@/services/audioSession';

const IS_WEB = Platform.OS === 'web';

let _globalPlayer: AudioPlayer | null = null;

const SESSION_ID = Math.random().toString(36).substring(2, 15);

interface TelemetryEvent {
  /** Client-generated UUID: retries and offline replays carry the same id, so the server inserts once. */
  client_event_id: string;
  song_id: string;
  session_id: string;
  event_type: 'play' | 'pause' | 'complete' | 'skip' | 'seek';
  started_at: string;
  ended_at: string | null;
  duration_played_ms: number;
  song_duration_ms: number | null;
  completion_percentage: number;
  /** Discovery surface: home | search | album | playlist | queue | autoplay | ... */
  source: string | null;
  source_id: string | null;
  /** Byte origin: cache | catalog | device | remote. */
  audio_origin: string | null;
  position_in_queue: number | null;
  device_type: string;
  app_version: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  genre?: string | null;
  colors?: string[] | null;
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
    const token = useAuthStore.getState().token;
    const res = await fetch(`${API_URL}/telemetry/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(eventsToSend),
    });
    // fetch resolves on 4xx/5xx: without this check every rejection and
    // every 401 (logged-out flush) is treated as delivered and dropped.
    if (!res.ok) throw new Error(`telemetry ${res.status}`);
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
  // Reschedule only while events remain. The old
  // `|| flushRetries < MAX` condition was always true after a success
  // (retries reset to 0), spinning a 10s timer forever on every app open.
  if (EVENT_BUFFER.length > 0) {
    flushTimeout = setTimeout(flushEvents, 10000);
  } else {
    flushTimeout = null;
    flushRetries = 0;
  }
}

function genEventId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

function recordEvent(event: Omit<TelemetryEvent, 'device_type' | 'app_version' | 'client_event_id'>) {
  EVENT_BUFFER.push({
    ...event,
    client_event_id: genEventId(),
    device_type: Platform.OS,
    app_version: '1.0.0',
  });
  if (EVENT_BUFFER.length >= BUFFER_MAX_SIZE) { if (flushTimeout) clearTimeout(flushTimeout); flushEvents(); }
  else if (!flushTimeout) { flushTimeout = setTimeout(flushEvents, 10000); }
}

// ---------------------------------------------------------------------------
// Single-listen tracking. Exactly one terminal row (complete|skip) is emitted
// per track when it ends — never on pause/resume/seek. Pause-time is excluded
// via the wall-clock anchor: accrueListen() banks (now - stamp) on every
// transition and stamp is null while paused, so only heard time lands in
// playedMs. playedMs is clamped to the track duration at emit: seek-forward
// jumps would otherwise count skipped-over audio as heard.
// ---------------------------------------------------------------------------
interface ActiveListen {
  songId: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  genre: string | null;
  colors: string[] | null;
  songDurationMs: number | null;
  startedAt: string;
  playedMs: number;
  stamp: number | null;
  resolved: boolean;
  position: number | null;
  surface: string | null;
  audioOrigin: string | null;
}

let activeListen: ActiveListen | null = null;
/** Track id whose terminal row was already emitted (natural end / sleep / repeat). */
let completedListenId: string | null = null;
let lastAudioOrigin: string | null = null;

function accrueListen() {
  if (activeListen?.stamp != null) {
    activeListen.playedMs += Math.max(0, Date.now() - activeListen.stamp);
    activeListen.stamp = Date.now();
  }
}

function beginListen(
  song: { id: string; title: string; artist: string; album: string; genre: string; colors: string[]; durationMs: number },
  position: number | null,
  surface: string | null,
) {
  activeListen = {
    songId: song.id,
    title: song.title?.slice(0, 512) ?? null,
    artist: song.artist?.slice(0, 512) ?? null,
    album: song.album?.slice(0, 512) ?? null,
    genre: song.genre?.slice(0, 128) ?? null,
    colors: song.colors ?? null,
    songDurationMs: song.durationMs ?? null,
    startedAt: new Date().toISOString(),
    playedMs: 0,
    stamp: null,
    resolved: false,
    position,
    surface,
    audioOrigin: null,
  };
  completedListenId = null;
}

function markListenResolved(audioOrigin: string | null, playing: boolean) {
  lastAudioOrigin = audioOrigin;
  if (!activeListen) return;
  activeListen.resolved = true;
  activeListen.audioOrigin = audioOrigin;
  if (playing) activeListen.stamp = Date.now();
}

/** Emit the terminal row for the active listen and clear it. */
function endListen(outcome: 'complete' | 'skip') {
  const l = activeListen;
  activeListen = null;
  if (!l) return;
  if (l.stamp != null) l.playedMs += Math.max(0, Date.now() - l.stamp);
  // Never heard a second of audio (load error, instant switch): not a listen.
  if (!l.resolved && l.playedMs <= 0) return;
  const durationMs = l.songDurationMs && l.songDurationMs > 0 ? l.songDurationMs : null;
  const playedMs = Math.round(durationMs != null ? Math.min(l.playedMs, durationMs) : l.playedMs);
  recordEvent({
    song_id: l.songId,
    title: l.title,
    artist: l.artist,
    album: l.album,
    genre: l.genre,
    colors: l.colors,
    song_duration_ms: durationMs,
    session_id: SESSION_ID,
    event_type: outcome,
    started_at: l.startedAt,
    ended_at: new Date().toISOString(),
    duration_played_ms: playedMs,
    completion_percentage:
      outcome === 'complete' ? 100 : durationMs ? Math.min(100, Math.round((playedMs / durationMs) * 100)) : 0,
    source: l.surface,
    source_id: null,
    audio_origin: l.audioOrigin,
    position_in_queue: l.position,
  });
}

let sessionStarted = false;
function recordSessionStart() {
  if (sessionStarted) return;
  sessionStarted = true;
  const token = useAuthStore.getState().token;
  fetch(`${API_URL}/telemetry/session/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_id: SESSION_ID, device_type: 'web', app_version: '1.0.0', entry_source: 'app_open' }),
  }).catch(() => {});
}

function recordSessionEnd(exitReason = 'user_close') {
  const token = useAuthStore.getState().token;
  fetch(`${API_URL}/telemetry/session/end`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_id: SESSION_ID, exit_reason: exitReason }),
  }).catch(() => {});
  if (EVENT_BUFFER.length > 0) flushEvents();
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const persistPendingEvents = () => {
    try {
      const pending = EVENT_BUFFER.splice(0, EVENT_BUFFER.length);
      if (pending.length > 0) {
        const key = 'muzix-telemetry-pending';
        const existing = JSON.parse(localStorage.getItem(key) ?? '[]');
        localStorage.setItem(key, JSON.stringify([...existing, ...pending].slice(-100)));
      }
    } catch {}
  };
  window.addEventListener('beforeunload', () => {
    recordSessionEnd('user_close');
    persistPendingEvents();
  });
  window.addEventListener('pagehide', () => {
    recordSessionEnd('background');
    persistPendingEvents();
  });
}

if (typeof window !== 'undefined') {
  try {
    const key = 'muzix-telemetry-pending';
    const pending = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(pending) && pending.length > 0) {
      EVENT_BUFFER.push(...pending.slice(-BUFFER_MAX_SIZE));
      localStorage.removeItem(key);
    }
  } catch {}
}

export function PlayerBridge() {
  const player = useAudioPlayer(null, {
    updateInterval: 250,
    preferredForwardBufferDuration: 15,
    keepAudioSessionActive: true,
  });
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
  const retryNonce = usePlayerStore((s) => s.retryNonce);

  useAppStateAudioSync(
    IS_WEB ? null : player,
    () => status.playing,
    (v: boolean) => usePlayerStore.getState().setPlaying(v),
  );

  const currentUrlRef = useRef<string | null>(null);
  const retryCountRef = useRef(0);
  const bufferedTrackRef = useRef<string | null>(null);
  const bufferedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionTrackRef = useRef<string | null>(null);
  const lockScreenActiveRef = useRef(false);
  // Track whose audio is still resolving (cache/R2/extract). Until replace()
  // lands, the player still holds the *previous* track — every other effect
  // must treat playback as owned by the loader, not the store.
  const loadInFlightRef = useRef<string | null>(null);
  const MAX_RETRIES = 3;

  useEffect(() => {
    if (_globalPlayer && _globalPlayer !== player) {
      try { _globalPlayer.release(); } catch {}
    }
    _globalPlayer = player;
    setActivePlayer(player);
    recordSessionStart();
    try { player.pause(); } catch {}
    return () => {
      if (lockScreenActiveRef.current) {
        clearLockScreenControls(player);
        lockScreenActiveRef.current = false;
      }
      setActivePlayer(null);
    };
  }, [player]);

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    retryCountRef.current = 0;
    externalPauseRef.current = false;
    // Stop the previous track immediately and mark this one as resolving.
    // Extraction/download takes seconds; without this the old audio keeps
    // sounding until replace() lands.
    try { player.pause(); } catch {}
    loadInFlightRef.current = current.id;
    setLoading(current.id);
    // Open the listen row now; the heard-time anchor starts when audio
    // actually resolves (markListenResolved). Surface comes from the queue
    // slot so shuffled/autoplay tails keep their own attribution.
    {
      const ps = usePlayerStore.getState();
      beginListen(current, ps.currentIndex, ps.queue[ps.currentIndex]?.surface ?? null);
    }

    const attemptLoad = async () => {
      try {
        // Single resolver: local cache -> our catalog (R2) -> on-device extract.
        const { uri: playUri, source: audioOrigin } = await resolveAudio(current.id, current);
        if (cancelled) return;

        currentUrlRef.current = playUri;

        player.replace({ uri: playUri });
        player.volume = volume;
        loadInFlightRef.current = null;
        // The user may have paused (or switched again) while this track was
        // still resolving — don't barge in if playback is no longer wanted.
        const shouldPlay = usePlayerStore.getState().isPlaying;
        markListenResolved(audioOrigin, shouldPlay);
        if (shouldPlay) {
          player.play();
        }
        if (!lockScreenActiveRef.current) {
          activateLockScreen(player, {
            title: current.title,
            artist: current.artist,
            albumTitle: current.album,
            artworkUrl: current.imageUrl,
          });
          lockScreenActiveRef.current = true;
        } else {
          updateLockScreenMetadata(player, {
            title: current.title,
            artist: current.artist,
            albumTitle: current.album,
            artworkUrl: current.imageUrl,
          });
        }
        if (shouldPlay) {
          setPlaying(true);
          trackPlay();
        }
        retryCountRef.current = 0;
        positionTrackRef.current = current.id;
        usePlayerStore.setState({ error: null });

        bufferedTrackRef.current = current.id;
        bufferedTimeoutRef.current = setTimeout(() => {
          if (bufferedTrackRef.current === current.id) {
            setLoading(null);
            bufferedTrackRef.current = null;
          }
        }, 10000);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          loadInFlightRef.current = null;
          setPlaying(false);
          setLoading(null);
          return;
        }
        // On-device extraction failures (bot check, age gate, unsupported
        // container) are not retryable — retrying just burns time.
        const msg = err instanceof Error ? err.message : String(err);
        const isFatal = /bot|sign in|unavailable|unsupported|private|age|removed|extract/i.test(msg);
        if (!isFatal && retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setTimeout(() => { if (!cancelled) attemptLoad(); }, 1000 * retryCountRef.current);
          return;
        }
        console.warn('[PlayerBridge] playback failed:', msg);
        loadInFlightRef.current = null;
        setPlaying(false);
        setLoading(null);
        usePlayerStore.setState({ error: msg.slice(0, 200) || 'Playback failed. Tap retry to try again.' });
      }
    };

    attemptLoad();
    return () => {
      cancelled = true;
      // Outgoing track ends here. Natural ends already emitted their terminal
      // row (activeListen is null then); anything still open was abandoned.
      if (activeListen && completedListenId !== current.id) endListen('skip');
      completedListenId = null;
      if (bufferedTimeoutRef.current) clearTimeout(bufferedTimeoutRef.current);
      bufferedTimeoutRef.current = null;
    };
  }, [current?.id, player, setLoading, setPlaying, retryNonce]);

  useEffect(() => {
    if (!current || bufferedTrackRef.current !== current.id) return;
    if (status.currentTime > 0) {
      if (bufferedTimeoutRef.current) clearTimeout(bufferedTimeoutRef.current);
      bufferedTimeoutRef.current = null;
      setLoading(null);
      bufferedTrackRef.current = null;
    }
  }, [status.currentTime, current?.id]);

  useEffect(() => {
    if (!current) return;
    if (positionTrackRef.current !== current.id) {
      usePlayerStore.getState().setPlaybackPosition(0, 0);
      return;
    }
    usePlayerStore.getState().setPlaybackPosition(
      Math.max(0, Math.round(status.currentTime * 1000)),
      status.duration ?? 0
    );
  }, [status.currentTime, status.duration, current?.id]);

  const externalPauseRef = useRef(false);
  const prevStatusPlayingRef = useRef(status.playing);
  useEffect(() => {
    if (prevStatusPlayingRef.current !== status.playing) {
      // Our own track-switch pause (see the load effect) is not an external
      // pause — a load is in flight, so leave the store alone.
      if (!status.playing && isPlaying && loadInFlightRef.current == null) {
        externalPauseRef.current = true;
        usePlayerStore.getState().setPlaying(false);
      }
      prevStatusPlayingRef.current = status.playing;
    }
  }, [status.playing, isPlaying]);

  useEffect(() => {
    if (!current) return;
    try {
      // While this track is still resolving, attemptLoad owns playback.
      // Resuming here would play the *previous* track, which is still loaded
      // until replace() lands.
      if (isPlaying && !status.playing && loadInFlightRef.current !== current.id) {
        if (externalPauseRef.current) {
          externalPauseRef.current = false;
        } else if (status.didJustFinish && status.duration && status.currentTime >= status.duration - 0.05) {
          player.seekTo(0);
          didJustFinishRef.current = false;
          prevTimeRef.current = 0;
        } else {
          player.play();
        }
      }
      if (!isPlaying && status.playing) player.pause();
    } catch {}
  }, [isPlaying, status.playing, current, player]);

  const prevIsPlayingRef = useRef(isPlaying);
  useEffect(() => {
    if (!current) return;
    if (prevIsPlayingRef.current !== isPlaying) {
      if (isPlaying) {
        // Resume: restart the heard-time anchor. Pauses banked nothing and
        // emitted nothing — one listen, one terminal row.
        if (activeListen && activeListen.songId === current.id) activeListen.stamp = Date.now();
      } else {
        accrueListen();
        if (activeListen) activeListen.stamp = null;
      }
    }
    prevIsPlayingRef.current = isPlaying;
  }, [isPlaying, current]);

  const didJustFinishRef = useRef(status.didJustFinish);
  const prevTimeRef = useRef(0);

  const handleTrackComplete = () => {
    if (!current) return;
    didJustFinishRef.current = true;
    // Natural end: the single terminal row for this listen (100%).
    completedListenId = current.id;
    endListen('complete');
    if (usePlayerStore.getState().sleepAfterTrack) {
      // Sleep-after-track: stop here instead of advancing the queue.
      usePlayerStore.getState().clearSleepTimer();
      try { player.pause(); } catch {}
      usePlayerStore.getState().setPlaying(false);
      return;
    }
    if (usePlayerStore.getState().repeat === 'one') {
      player.seekTo(0);
      player.play();
      // Same track replays: open a fresh listen; the bytes are already loaded.
      {
        const ps = usePlayerStore.getState();
        beginListen(current, ps.currentIndex, ps.queue[ps.currentIndex]?.surface ?? null);
        markListenResolved(lastAudioOrigin, true);
      }
      return;
    }
    usePlayerStore.getState().next();
  };

  useEffect(() => {
    if (positionTrackRef.current !== current?.id) return;
    if (status.didJustFinish && current && !didJustFinishRef.current) {
      handleTrackComplete();
    } else if (!status.didJustFinish) {
      didJustFinishRef.current = false;
    }
  }, [status.didJustFinish, current]);

  useEffect(() => {
    if (!current || positionTrackRef.current !== current.id) return;
    // Sleep timer: stop when the deadline passes, wherever playback is.
    const endsAt = usePlayerStore.getState().sleepTimerEndsAt;
    if (endsAt != null && isPlaying && Date.now() >= endsAt) {
      usePlayerStore.getState().clearSleepTimer();
      // Deadline hit mid-track: bank heard time like a pause and keep the
      // listen open — resume continues the same listen, track change ends it.
      accrueListen();
      if (activeListen) activeListen.stamp = null;
      try { player.pause(); } catch {}
      usePlayerStore.getState().setPlaying(false);
      return;
    }
    if (!status.duration || status.duration <= 0) return;
    const curr = status.currentTime;
    if (curr < prevTimeRef.current - 0.5) {
      didJustFinishRef.current = false;
    }
    if (!didJustFinishRef.current && curr >= status.duration * 0.98 && isPlaying) {
      handleTrackComplete();
    }
    prevTimeRef.current = curr;
  }, [status.currentTime, status.duration, current?.id, isPlaying]);

  useEffect(() => {
    if (seekPosition == null || !current) return;
    const clampedFraction = Math.max(0, Math.min(seekPosition, 1));
    const durationSec = status.duration > 0 ? status.duration : (current.durationMs ?? 0) / 1000;
    // Bank heard time up to the seek point; the anchor restarts after the
    // jump so skipped-over audio is never counted as heard. No row emitted.
    accrueListen();
    player.seekTo(clampedFraction * durationSec);
    usePlayerStore.getState().setPlaybackPosition(clampedFraction * durationSec * 1000, durationSec);
    setSeekPosition(null);
  }, [seekPosition, current, player, status.duration, setSeekPosition]);

  useEffect(() => {
    if (!IS_WEB) return;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua));
    if (isIOS) return;
    try {
      player.volume = volume;
    } catch {}
  }, [volume, player, current?.id]);

  return null;
}
