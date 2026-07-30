import { safeStorage } from '@/store/storage';

const QUEUE_KEY = 'muzix-offline-queue';
const MAX_QUEUE_SIZE = 50;

interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

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

export async function enqueueRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<void> {
  const queue = await loadQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
  }
  queue.push({
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url,
    method,
    headers,
    body,
    timestamp: Date.now(),
  });
  await saveQueue(queue);
}

export async function retryQueuedRequests(): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  const queue = await loadQueue();
  if (queue.length === 0) return;

  const remaining: QueuedRequest[] = [];
  for (const req of queue) {
    try {
      await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
    } catch {
      remaining.push(req);
    }
  }
  await saveQueue(remaining);
}

export function startRetryLoop(intervalMs = 30_000) {
  if (retryTimer) return;
  retryTimer = setInterval(() => {
    retryQueuedRequests();
  }, intervalMs);
}

export function stopRetryLoop() {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}

export async function getPendingCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}
