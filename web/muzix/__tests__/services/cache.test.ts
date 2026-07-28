jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: jest.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, writable: true });

import { cachedFetch, clearCache, clearExpired, cacheStats, setCacheTTL } from '@/services/cache';

const mockFetch = jest.fn();
global.fetch = mockFetch;

function okResponse(data: any, etag?: string) {
  const headers = new Map();
  if (etag) headers.set('ETag', etag);
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: (k: string) => headers.get(k) ?? null },
  } as unknown as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearCache();
  mockLocalStorage.clear();
  jest.spyOn(Date, 'now').mockReturnValue(1000000);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cachedFetch', () => {
  it('fetches and caches fresh data', async () => {
    const data = [{ id: '1', title: 'Song 1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));

    const result = await cachedFetch('/songs');
    expect(result).toEqual(data);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached data on subsequent calls', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));

    await cachedFetch('/songs');
    mockFetch.mockClear();

    const result = await cachedFetch('/songs');
    expect(result).toEqual(data);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends If-None-Match header when cached etag exists', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data, 'W/"abc123"'));
    await cachedFetch('/songs');

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ ok: true, status: 304, json: () => Promise.resolve(null), text: () => Promise.resolve(''), headers: { get: () => null } });
    await cachedFetch('/songs');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ 'If-None-Match': 'W/"abc123"' }),
      })
    );
  });

  it('returns cached data on 304 response', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ ok: true, status: 304, json: () => Promise.resolve(null), text: () => Promise.resolve(''), headers: { get: () => null } });
    const result = await cachedFetch('/songs');
    expect(result).toEqual(data);
  });

  it('returns stale cache on fetch failure', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    jest.advanceTimersByTime(600000);
    mockFetch.mockClear();
    mockFetch.mockRejectedValueOnce(new Error('Network error'));
    const result = await cachedFetch('/songs');
    expect(result).toEqual(data);
  });

  it('throws when no cache and fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fail'));
    await expect(cachedFetch('/songs')).rejects.toThrow('fail');
  });

  it('returns cached data when API returns error but cache is fresh', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({ detail: 'Server error' }), text: () => Promise.resolve('Server error'), headers: { get: () => null } });
    const result = await cachedFetch('/songs');
    expect(result).toEqual(data);
  });
});

describe('TTL and expiration', () => {
  it('expires entries after default TTL', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(okResponse([{ id: '2' }]));
    await cachedFetch('/songs');
    expect(mockFetch).toHaveBeenCalled();
  });

  it('respects custom TTL overrides', async () => {
    setCacheTTL('/search', 30000);
    const data = { songs: [] };
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/search?q=test');

    jest.advanceTimersByTime(31000);
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(okResponse({ songs: [] }));
    await cachedFetch('/search?q=test');
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('clearCache', () => {
  it('clears in-memory cache', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    clearCache();
    const stats = cacheStats();
    expect(stats.memoryEntries).toBe(0);
  });

  it('triggers re-fetch after clearing', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    clearCache();
    mockFetch.mockClear();
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('clearExpired', () => {
  it('removes expired entries', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);
    const removed = clearExpired();
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 when no expired entries', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    const removed = clearExpired();
    expect(removed).toBe(0);
  });
});

describe('cacheStats', () => {
  it('reports memory entries', async () => {
    const data = [{ id: '1' }];
    mockFetch.mockResolvedValueOnce(okResponse(data));
    await cachedFetch('/songs');

    const stats = cacheStats();
    expect(stats.memoryEntries).toBeGreaterThanOrEqual(1);
  });
});
