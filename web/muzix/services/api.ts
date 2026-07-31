import { cachedFetch } from '@/services/cache';
import { isOnline } from '@/services/networkStatus';
import { useAuthStore } from '@/store/authStore';
import { API_URL } from '@/lib/config';
import * as Sentry from '@sentry/react-native';

const REQUEST_TIMEOUT = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];

const inFlight = new Map<string, Promise<unknown>>();

let _authErrorHandled = false;
function handleAuthError() {
  if (_authErrorHandled) return;
  _authErrorHandled = true;
  const { token } = useAuthStore.getState();
  if (token) {
    useAuthStore.getState().logout();
    try {
      // Lazy import to avoid circular dependency at module load time
      const { router } = require('expo-router');
      router.replace('/login');
    } catch {
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }
  setTimeout(() => { _authErrorHandled = false; }, 5000);
}

export type ErrorKind = 'NetworkError' | 'AuthError' | 'ServerError' | 'ValidationError';
export type ErrorSeverity = 'fatal' | 'recoverable' | 'info';

export class ApiError extends Error {
  status: number;
  kind: ErrorKind;
  severity: ErrorSeverity;
  retryable: boolean;

  constructor(status: number, message: string, kind: ErrorKind) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.kind = kind;
    this.severity = status >= 500 ? 'fatal' : status >= 400 ? 'recoverable' : 'info';
    this.retryable = kind === 'NetworkError' || (status >= 500 && status < 600);
  }
}

function classifyError(status: number): ErrorKind {
  if (status === 0) return 'NetworkError';
  if (status === 401 || status === 403) return 'AuthError';
  if (status >= 400 && status < 500) return 'ValidationError';
  return 'ServerError';
}

function timeoutFetch(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new ApiError(0, 'Request timed out', 'NetworkError'));
    }, REQUEST_TIMEOUT);

    fetch(url, { ...init, signal: controller.signal })
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => {
        clearTimeout(timer);
        if (err instanceof ApiError) reject(err);
        else if (err?.name === 'AbortError') reject(new ApiError(0, 'Request timed out', 'NetworkError'));
        else reject(new ApiError(0, err?.message ?? 'Network error', 'NetworkError'));
      });
  });
}

async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: ApiError | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const apiErr = err instanceof ApiError
        ? err
        : new ApiError(0, String(err), 'NetworkError');
      lastError = apiErr;

      if (!apiErr.retryable || attempt === MAX_RETRIES) throw apiErr;
      if (!isOnline()) throw new ApiError(0, 'No network connection', 'NetworkError');

      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw lastError!;
}

async function parseErrorBody(res: Response): Promise<string> {
  const text = await res.text();
  try {
    return JSON.parse(text).detail ?? text;
  } catch {
    return text;
  }
}

interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  skipRetry?: boolean;
}

async function requestRaw<T>(path: string, options?: RequestOptions): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await timeoutFetch(url, {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: options?.body,
  });

  if (!res.ok) {
    const msg = await parseErrorBody(res);
    if (res.status === 401) {
      handleAuthError();
    }
    const requestId = res.headers.get('x-request-id');
    if (requestId) {
      Sentry.withScope((scope) => {
        scope.setTag('request_id', requestId);
        scope.setTag('api_path', path);
        Sentry.captureMessage(`${classifyError(res.status)} ${res.status}: ${path}`, 'error');
      });
    }
    throw new ApiError(res.status, msg, classifyError(res.status));
  }
  const requestId = res.headers.get('x-request-id');
  if (requestId) {
    Sentry.setTag('request_id', requestId);
  }
  const raw = await res.json();
  return (raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw) as T;
}

async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  if (options?.skipRetry) return requestRaw<T>(path, options);
  // Deduplicate concurrent requests to the same path
  const key = `${options?.method ?? 'GET'}:${path}`;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = retryWithBackoff(() => requestRaw<T>(path, options));
  inFlight.set(key, promise);
  promise.finally(() => inFlight.delete(key));
  return promise;
}

async function requestAuthed<T>(path: string, token: string, options?: RequestOptions): Promise<T> {
  return request<T>(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
}

export interface ApiSong {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  genre?: string | null;
  duration: string;
  durationMs: number;
  track?: number | null;
  lyrics?: string | null;
  colors: string[];
  imageUrl?: string | null;
  audioUrl?: string | null;
  r2_object_key?: string | null;
}

export interface ApiAlbum {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year: number;
  genre: string;
  colors: string[];
  imageUrl?: string | null;
  songIds: string[];
}

export interface ApiArtist {
  id: string;
  name: string;
  colors: string[];
  albumIds: string[];
}

export interface ApiPlaylist {
  id: string;
  title: string;
  colors: string[];
  songIds: string[];
}

export interface SearchResponse {
  songs: ApiSong[];
  albums: ApiAlbum[];
  artists: ApiArtist[];
}

export interface StreamResponse {
  id: string;
  title: string;
  artist: string;
  url: string;
  expires_in: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface SkipRateItem {
  song: ApiSong;
  playCount: number;
  skipCount: number;
  skipRate: number;
}

export interface CompletionRateItem {
  song: ApiSong;
  playCount: number;
  avgCompletionPercentage: number;
  completionRate: number;
}

export interface DiscoveryMetrics {
  period: string;
  totalPlays: number;
  uniqueSongs: number;
  firstTimePlays: number;
  repeatPlays: number;
  discoveryRatio: number;
  repeatPlayRatio: number;
}

export interface ArtistAffinityItem {
  artist: string;
  artistId: string;
  plays: number;
  completions: number;
  skips: number;
  uniqueSongs: number;
  affinityScore: number;
}

export interface ListeningPatterns {
  period: string;
  hourly: Record<number, number>;
  daily: Record<number, number>;
  peakHours: number[];
  peakDays: number[];
}

export interface TrendAnalysis {
  period: string;
  current: Record<string, number>;
  previous: Record<string, number>;
  pctChange: Record<string, number>;
}

export interface CatalogExploration {
  period: string;
  totalPlays: number;
  uniqueSongs: number;
  totalCatalogSongs: number;
  explorationRatio: number;
  repeatPlayRatio: number;
}

export interface QueueDropoff {
  period: string;
  avgSkipPosition: number;
  totalSkips: number;
  dropoffByPosition: Record<number, number>;
}

export interface SourceEffectiveness {
  period: string;
  sources: Record<string, {
    plays: number;
    completionRate: number;
    avgDurationMs: number;
    engagementScore: number;
  }>;
}

export interface BingeIndex {
  period: string;
  totalPlays: number;
  totalSessions: number;
  songsPerSession: number;
  avgSessionGapHours: number;
  bingeIndex: number;
}

export interface HomeMood {
  label: string;
  color: string;
}

export interface HomeActivityItem {
  id: string;
  song_id: string;
  song: { id: string; title: string; artist: string; album: string; colors: string[] } | null;
  event_type: string;
  started_at: string;
  duration_played_ms: number;
  completion_percentage: number;
  source: string;
}

export interface HomeResponse {
  recentActivity: HomeActivityItem[];
  topPicks: ApiSong[];
  mood: HomeMood;
}

export const api = {
  home: (token?: string) => {
    if (token) return requestAuthed<HomeResponse>('/home', token);
    return request<HomeResponse>('/home');
  },

  songs: (limit = 50, offset = 0, token?: string) => cachedFetch<ApiSong[]>(`/songs?limit=${limit}&offset=${offset}`, token),
  song: (id: string, token?: string) => cachedFetch<ApiSong>(`/songs/${id}`, token),
  albums: (token?: string) => cachedFetch<ApiAlbum[]>(`/albums`, token),
  album: (id: string, token?: string) => cachedFetch<ApiAlbum>(`/albums/${id}`, token),
  artists: (token?: string) => cachedFetch<ApiArtist[]>(`/artists`, token),
  artist: (id: string, token?: string) => cachedFetch<ApiArtist>(`/artists/${id}`, token),
  playlists: (token?: string) => cachedFetch<ApiPlaylist[]>(`/playlists`, token),
  playlist: (id: string, token?: string) => cachedFetch<ApiPlaylist>(`/playlists/${id}`, token),
  search: (q: string, token?: string) => cachedFetch<SearchResponse>(`/search?q=${encodeURIComponent(q)}`, token),

  stream: (id: string, token?: string) => {
    if (token) return requestAuthed<StreamResponse>(`/stream/${id}`, token, { skipRetry: true });
    return request<StreamResponse>(`/stream/${id}`, { skipRetry: true });
  },

  register: (email: string, password: string, displayName?: string) =>
    request<AuthResponse>(`/auth/register`, { method: 'POST', body: JSON.stringify({ email, password, displayName: displayName ?? '' }) }),
  login: (email: string, password: string) =>
    request<AuthResponse>(`/auth/login`, { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: (token: string) => requestAuthed<User>(`/auth/me`, token),

  like: (songId: string, token: string) => requestAuthed<{ status: string }>(`/likes/${songId}`, token, { method: 'POST' }),
  unlike: (songId: string, token: string) => requestAuthed<{ status: string }>(`/likes/${songId}`, token, { method: 'DELETE' }),
  getLikes: (token: string) => requestAuthed<{ songIds: string[] }>(`/likes`, token),

  createPlaylist: (title: string, songIds: string[], token: string) =>
    requestAuthed<ApiPlaylist>('/playlists', token, { method: 'POST', body: JSON.stringify({ title, songIds }) }),
  updatePlaylist: (id: string, title: string, songIds: string[], token: string) =>
    requestAuthed<ApiPlaylist>(`/playlists/${id}`, token, { method: 'PUT', body: JSON.stringify({ title, songIds }) }),
  deletePlaylist: (id: string, token: string) =>
    requestAuthed<{ status: string }>(`/playlists/${id}`, token, { method: 'DELETE' }),
  addSongToPlaylist: (playlistId: string, songId: string, token: string) =>
    requestAuthed<ApiPlaylist>(`/playlists/${playlistId}/songs/${songId}`, token, { method: 'POST' }),
   removeSongFromPlaylist: (playlistId: string, songId: string, token: string) =>
    requestAuthed<ApiPlaylist>(`/playlists/${playlistId}/songs/${songId}`, token, { method: 'DELETE' }),

   topSongs: (period: string, limit: number, token: string) =>
     requestAuthed<{ period: string; items: SkipRateItem[] }>(`/analytics/user/top-songs?period=${period}&limit=${limit}`, token),
   recommendations: (limit: number, token: string) =>
     requestAuthed<{ items: Song[]; meta: { trained: boolean; lastTrainedAt: string | null } }>(`/recommendations/user/top-picks?limit=${limit}`, token),
   userStats: (period: string, token: string) =>
     requestAuthed<{ period: string; totalListeningMs: number; totalListeningHours: number; totalPlays: number; uniqueSongs: number; uniqueArtists: number; sessions: number; avgSessionMs: number }>(`/analytics/user/stats?period=${period}`, token),
   recentActivity: (limit: number, token: string) =>
     requestAuthed<{ items: any[] }>(`/analytics/user/recent-activity?limit=${limit}`, token),
   skipRate: (period: string, limit: number, token: string) =>
     requestAuthed<{ period: string; items: SkipRateItem[] }>(`/analytics/user/skip-rate?period=${period}&limit=${limit}`, token),
   completionRate: (period: string, limit: number, token: string) =>
     requestAuthed<{ period: string; items: CompletionRateItem[] }>(`/analytics/user/completion-rate?period=${period}&limit=${limit}`, token),
   discovery: (period: string, token: string) =>
     requestAuthed<DiscoveryMetrics>(`/analytics/user/discovery?period=${period}`, token),
   artistAffinity: (period: string, limit: number, token: string) =>
     requestAuthed<{ period: string; items: ArtistAffinityItem[] }>(`/analytics/user/artist-affinity?period=${period}&limit=${limit}`, token),
   listeningPatterns: (period: string, token: string) =>
     requestAuthed<ListeningPatterns>(`/analytics/user/listening-patterns?period=${period}`, token),
   trends: (period: string, token: string) =>
     requestAuthed<TrendAnalysis>(`/analytics/user/trends?period=${period}`, token),
   catalogExploration: (period: string, token: string) =>
     requestAuthed<CatalogExploration>(`/analytics/user/catalog-exploration?period=${period}`, token),
   queueDropoff: (period: string, token: string) =>
     requestAuthed<QueueDropoff>(`/analytics/user/queue-dropoff?period=${period}`, token),
   sourceEffectiveness: (period: string, token: string) =>
     requestAuthed<SourceEffectiveness>(`/analytics/user/source-effectiveness?period=${period}`, token),
   bingeIndex: (period: string, token: string) =>
     requestAuthed<BingeIndex>(`/analytics/user/binge-index?period=${period}`, token),

  recordDuration: (songId: string, durationMs: number, token: string) =>
    requestAuthed<{ recorded_ms: number }>('/telemetry/duration', token, {
      method: 'POST',
      body: JSON.stringify({ song_id: songId, session_id: '', duration_ms: durationMs }),
      skipRetry: true,
    }),

  logError(error: Error, context: string) {
    console.error(`[MUZIX API] ${context}:`, error);
    // TODO: Integrate with Sentry or similar
  },
};
