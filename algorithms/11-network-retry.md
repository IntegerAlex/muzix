# 11 — Network Retry

Exponential backoff, request timeout, error classification, and concurrent request deduplication.

- **Type**: Known (exponential backoff) + Custom
- **File**: `web/muzix/services/api.ts`, lines 1–97

## How it works

### 1. Exponential Backoff (`retryWithBackoff`, lines 79–97)

```typescript
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1_000, 2_000, 4_000];  // exponential: 1s, 2s, 4s

async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try { return await fn(); }
    catch (err) {
      if (!apiErr.retryable || attempt === MAX_RETRIES) throw apiErr;
      if (!isOnline()) throw new ApiError(0, 'No network connection', 'NetworkError');
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
}
```

### 2. Request Timeout (`timeoutFetch`, lines 60–77)

AbortController-based 10-second timeout:

```typescript
const REQUEST_TIMEOUT = 10_000;

function timeoutFetch(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    reject(new ApiError(0, 'Request timed out', 'NetworkError'));
  }, REQUEST_TIMEOUT);
  fetch(url, { ...init, signal: controller.signal })...
}
```

### 3. Error Classification (`ApiError`, lines 37–58)

| Status | Kind | Severity | Retryable |
|--------|------|----------|-----------|
| 0 | NetworkError | fatal | Yes |
| 401, 403 | AuthError | recoverable | No |
| 400–499 | ValidationError | recoverable | No |
| 500–599 | ServerError | fatal | Yes |

### 4. Concurrent Request Dedup (lines 12, 152–162)

```typescript
const inFlight = new Map<string, Promise<unknown>>();

async function request<T>(path, options) {
  const key = `${options?.method ?? 'GET'}:${path}`;
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = retryWithBackoff(() => requestRaw<T>(path, options));
  inFlight.set(key, promise);
  promise.finally(() => inFlight.delete(key));
  return promise;
}
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max retries | 3 | 4 total attempts |
| Retry delays | [1000, 2000, 4000]ms | Exponential doubling |
| Request timeout | 10,000ms | AbortController |
| Auth error cooldown | 5,000ms | Prevents rapid-fire logouts |

## Input → Output

- **Input**: HTTP request function
- **Output**: Retried response or classified error
