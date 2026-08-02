import { Platform } from 'react-native';
import { API_URL } from '@/lib/config';

async function handleAuthRefresh(): Promise<boolean> {
  try {
    const { useAuthStore } = require('@/store/authStore');
    const { token, refreshToken } = useAuthStore.getState();
    if (!refreshToken) return false;
    const { api } = require('@/services/api');
    const data = await api.refresh(refreshToken);
    useAuthStore.getState().setAuth(data.token, data.refreshToken, data.user);
    return true;
  } catch {
    return false;
  }
}

interface CacheEntry {
  etag: string;
  data: unknown;
  timestamp: number;
  accessTime: number;
  ttl: number;
}

const MAX_CACHE_ENTRIES = 200;
const DEFAULT_TTL = 5 * 60 * 1000;
const STORAGE_KEY = 'muzix-cache';
const CACHE_VERSION = 2;

const memCache = new Map<string, CacheEntry>();

const TTL_OVERRIDES: Record<string, number> = {};

export function setCacheTTL(path: string, ttlMs: number): void {
  TTL_OVERRIDES[path] = ttlMs;
}

function getTTL(path: string): number {
  for (const [pattern, ttl] of Object.entries(TTL_OVERRIDES)) {
    if (path.startsWith(pattern)) return ttl;
  }
  return DEFAULT_TTL;
}

function isExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > entry.ttl;
}

function touchEntry(key: string): void {
  const entry = memCache.get(key);
  if (entry) {
    entry.accessTime = Date.now();
    memCache.set(key, entry);
  }
}

function evictLRU(): void {
  if (memCache.size <= MAX_CACHE_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;
  for (const [k, v] of memCache) {
    if (v.accessTime < oldestTime) {
      oldestTime = v.accessTime;
      oldestKey = k;
    }
  }
  if (oldestKey) memCache.delete(oldestKey);
}

function loadDiskSync(): Map<string, CacheEntry> {
  if (Platform.OS !== 'web') return new Map();
  try {
    const storedVersion = localStorage.getItem(`${STORAGE_KEY}-version`);
    if (storedVersion !== String(CACHE_VERSION)) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(`${STORAGE_KEY}-version`, String(CACHE_VERSION));
      return new Map();
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    const entries = new Map<string, CacheEntry>();
    for (const [k, v] of Object.entries(parsed)) {
      const entry = v as CacheEntry;
      if (!isExpired(entry)) entries.set(k, entry);
    }
    return entries;
  } catch {
    return new Map();
  }
}

function saveDiskSync(cache: Map<string, CacheEntry>): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(`${STORAGE_KEY}-version`, String(CACHE_VERSION));
    const obj: Record<string, CacheEntry> = {};
    cache.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {}
}

let diskLoaded = false;
function ensureDiskLoaded(): void {
  if (diskLoaded) return;
  diskLoaded = true;
  const disk = loadDiskSync();
  disk.forEach((v, k) => memCache.set(k, v));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveDisk(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveDiskSync(memCache);
    saveTimer = null;
  }, 500);
}

async function readDisk(key: string): Promise<CacheEntry | null> {
  ensureDiskLoaded();
  return memCache.get(key) ?? null;
}

async function writeDisk(key: string, entry: CacheEntry): Promise<void> {
  evictLRU();
  memCache.set(key, entry);
  debouncedSaveDisk();
}

function unwrapEnvelope<T>(raw: T): T {
  if (raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)) {
    return (raw as Record<string, unknown>).data as T;
  }
  return raw;
}

export async function cachedFetch<T>(path: string, token?: string, ttlMs?: number): Promise<T> {
  const key = `api:${path}`;
  const cached = await readDisk(key);

  if (cached && !isExpired(cached)) {
    touchEntry(key);
    return unwrapEnvelope<T>(cached.data as T);
  }

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [1_000, 2_000, 4_000];

  try {
    let res: Response | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        res = await fetch(`${API_URL}${path}`, { headers });
        break;
      } catch (netErr) {
        if (attempt === MAX_RETRIES) throw netErr;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
      }
    }

    if (!res) throw new Error('Network error');

    if (res.status === 304 && cached) {
      touchEntry(key);
      return unwrapEnvelope<T>(cached.data as T);
    }
    if (res.status === 401) {
      // Stale/expired token — kick the shared refresh path, then retry once.
      const refreshed = await handleAuthRefresh();
      if (refreshed) {
        const { useAuthStore } = require('@/store/authStore');
        const newToken = useAuthStore.getState().token;
        const retryHeaders = { ...headers };
        if (newToken) retryHeaders['Authorization'] = `Bearer ${newToken}`;
        res = await fetch(`${API_URL}${path}`, { headers: retryHeaders });
      }
    }
    if (!res.ok) {
      if (cached && !isExpired(cached)) return unwrapEnvelope<T>(cached.data as T);
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }

    const etag = res.headers.get('ETag') ?? '';
    const raw = await res.json();
    const data = unwrapEnvelope<T>(
      (raw && typeof raw === 'object' && 'data' in raw ? raw.data : raw) as T
    );

    if (Array.isArray(data) && data.length === 0 && cached && !isExpired(cached)) return unwrapEnvelope<T>(cached.data as T);
    const ttl = ttlMs ?? getTTL(path);
    await writeDisk(key, { etag, data, timestamp: Date.now(), accessTime: Date.now(), ttl });
    return data;
  } catch (e) {
    if (cached && !isExpired(cached)) return unwrapEnvelope<T>(cached.data as T);
    throw e;
  }
}

export function clearCache(): void {
  memCache.clear();
  if (Platform.OS === 'web') {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(`${STORAGE_KEY}-version`);
    } catch {}
  }
}

export function clearExpired(): number {
  let removed = 0;
  for (const [k, v] of memCache) {
    if (isExpired(v)) {
      memCache.delete(k);
      removed++;
    }
  }
  if (removed > 0) saveDiskSync(memCache);
  return removed;
}

export function cacheStats(): { memoryEntries: number; diskEntries: number } {
  ensureDiskLoaded();
  return { memoryEntries: memCache.size, diskEntries: memCache.size };
}


