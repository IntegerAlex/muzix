import { safeStorage } from '@/store/storage';
import { API_URL } from '@/lib/config';
import { isOnline } from '@/services/networkStatus';
import { showToast } from '@/lib/toastBridge';

const QUEUE_KEY = 'muzix-offline-queue';
const MAX_QUEUE_SIZE = 50;
const REQUEST_TIMEOUT = 10_000;

class AuthExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'AuthExpiredError';
  }
}

interface QueuedRequest {
  id: string;
  path: string;
  method: string;
  body?: string;
  timestamp: number;
}

async function loadQueue(): Promise<QueuedRequest[]> {
  try {
    const raw = await safeStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedRequest[]) {
  try {
    await safeStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function enqueueRequest(path: string, method: string, body?: string): Promise<void> {
  const queue = await loadQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
  }
  queue.push({
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path,
    method,
    body,
    timestamp: Date.now(),
  });
  await saveQueue(queue);
}

async function sendRequest(req: QueuedRequest): Promise<void> {
  const { useAuthStore } = await import('@/store/authStore');
  const token = useAuthStore.getState().token;

  const startFetch = (authToken: string | null) => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), REQUEST_TIMEOUT);
    return {
      promise: fetch(`${API_URL}${req.path}`, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: req.body,
        signal: c.signal,
      }),
      abort: () => clearTimeout(t),
    };
  };
  const first = startFetch(token);
  let res = await first.promise;
  first.abort();
  if (res.status === 401) {
    const { refreshTokens } = useAuthStore.getState();
    const refreshed = await refreshTokens();
    if (!refreshed) throw new AuthExpiredError();
    const newToken = useAuthStore.getState().token;
    const retry = startFetch(newToken);
    res = await retry.promise;
    retry.abort();
    if (res.status === 401) throw new AuthExpiredError();
  }
  if (!res.ok) throw new Error(`API ${res.status}`);
}

async function clearQueue(): Promise<void> {
  try {
    await safeStorage.removeItem(QUEUE_KEY);
  } catch {}
}

export async function retryQueuedRequests(): Promise<void> {
  if (!isOnline()) return;

  const queue = await loadQueue();
  if (queue.length === 0) return;

  const remaining: QueuedRequest[] = [];
  for (const req of queue) {
    try {
      await sendRequest(req);
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        await clearQueue();
        const { useAuthStore } = await import('@/store/authStore');
        useAuthStore.getState().logout();
        showToast('Session expired. Please log in again.', 'error');
        return;
      }
      remaining.push(req);
    }
  }
  await saveQueue(remaining);
}

export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}
