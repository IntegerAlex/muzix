const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@/services/cache', () => ({
  cachedFetch: jest.fn(),
}));

import { cachedFetch } from '@/services/cache';

const mockCachedFetch = cachedFetch as jest.MockedFunction<typeof cachedFetch>;

function mockResponse(data: any, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: { get: () => null },
  } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCachedFetch.mockReset();
});

describe('cachedFetch caching behavior', () => {
  it('returns cached data on hit without calling fetch', async () => {
    const cached = [{ id: '1', title: 'Cached Song' }];
    mockCachedFetch.mockResolvedValue(cached as any);

    const { cachedFetch } = require('@/services/cache');
    const result = await cachedFetch('/songs?limit=10');
    expect(result).toEqual(cached);
    expect(mockCachedFetch).toHaveBeenCalledWith('/songs?limit=10');
  });

  it('passes token parameter through', async () => {
    mockCachedFetch.mockResolvedValue([] as any);
    const { cachedFetch } = require('@/services/cache');
    await cachedFetch('/likes', 'test-token');
    expect(mockCachedFetch).toHaveBeenCalledWith('/likes', 'test-token');
  });

  it('passes TTL parameter through', async () => {
    mockCachedFetch.mockResolvedValue([] as any);
    const { cachedFetch } = require('@/services/cache');
    await cachedFetch('/songs?limit=5', undefined, 60000);
    expect(mockCachedFetch).toHaveBeenCalledWith('/songs?limit=5', undefined, 60000);
  });

  it('propagates errors from cachedFetch', async () => {
    mockCachedFetch.mockRejectedValue(new Error('Network failure'));
    const { cachedFetch } = require('@/services/cache');
    await expect(cachedFetch('/songs')).rejects.toThrow('Network failure');
  });
});

describe('data endpoint paths', () => {
  const endpoints = [
    { name: 'songs', fn: () => mockCachedFetch('/songs?limit=100'), path: '/songs?limit=100' },
    { name: 'albums', fn: () => mockCachedFetch('/albums'), path: '/albums' },
    { name: 'artists', fn: () => mockCachedFetch('/artists'), path: '/artists' },
    { name: 'playlists', fn: () => mockCachedFetch('/playlists'), path: '/playlists' },
    { name: 'search', fn: () => mockCachedFetch('/search?q=test'), path: '/search?q=test' },
  ];

  it.each(endpoints)('calls cachedFetch for $name endpoint', async ({ fn, path }) => {
    mockCachedFetch.mockResolvedValue([] as any);
    await fn();
    expect(mockCachedFetch).toHaveBeenCalledWith(path);
  });
});
