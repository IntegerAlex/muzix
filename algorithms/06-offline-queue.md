# 06 — Offline Queue

FIFO request queue with persistent storage and promise-based queue for offline resilience.

- **Type**: Custom
- **File**: `web/muzix/services/offlineQueue.ts`, lines 1–86 (FIFO queue)
- **File**: `web/muzix/services/networkStatus.ts`, lines 44–71 (promise queue)

## How it works

### 1. FIFO Request Queue (`offlineQueue.ts`)

Stores failed HTTP requests in persistent storage and retries them when the device comes online.

**Enqueue** (lines 32–46):
```typescript
async function enqueueRequest(url, method, headers, body?) {
  const queue = await loadQueue();
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();  // FIFO eviction: drop oldest
  }
  queue.push({ id, url, method, headers, body, timestamp: Date.now() });
  await saveQueue(queue);
}
```

**Retry** (lines 48–67):
```typescript
async function retryQueuedRequests() {
  if (!navigator.onLine) return;
  const queue = await loadQueue();
  const remaining = [];
  for (const req of queue) {
    try { await fetch(req.url, { method, headers, body }); }
    catch { remaining.push(req); }  // keep failed requests
  }
  await saveQueue(remaining);
}
```

**Retry loop** (lines 69–74): `setInterval(retryQueuedRequests, 30_000)` — retries every 30 seconds.

### 2. Promise Queue (`networkStatus.ts`, lines 44–71)

Queues in-memory promises while offline, flushes them on reconnect:

```typescript
function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ id, fn, resolve, reject });
  });
}

function flushQueue() {
  const pending = [...queue];
  queue.length = 0;
  pending.forEach(req => req.fn().then(req.resolve).catch(req.reject));
}

onStatusChange((online) => { if (online) flushQueue(); });
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max queue size | 50 | FIFO eviction when full |
| Retry interval | 30,000ms (30s) | Periodic retry loop |
| Storage key | `muzix-offline-queue` | Persisted to safeStorage |

## Relationship to play-time tracking

- `05-play-time-tracking.md` handles duration accumulation and server upsert
- `06-offline-queue.md` handles failed HTTP request retry
- They are separate: playTimeTracker owns duration math; offlineQueue owns failed request retry

## Input → Output

- **Input**: Failed HTTP requests (url, method, headers, body)
- **Output**: Retried requests on reconnect; remaining failed requests stay queued
