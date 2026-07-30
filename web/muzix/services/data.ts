import { useState, useEffect, useCallback, useRef } from 'react';
import { api, type ApiSong, type ApiAlbum, type ApiArtist, type ApiPlaylist, type HomeResponse } from '@/services/api';
import type { Song, Album, Artist, Playlist, QueryResult } from '@/services/types';
import { useAuthStore } from '@/store/authStore';

let _songs: Song[] = [];
let _albums: Album[] = [];
let _artists: Artist[] = [];
let _playlists: Playlist[] = [];
let _version = 0;
let _totalSongCount = 0;
let _hasMoreSongs = false;

const _listeners = new Set<() => void>();

function _emitVersionChange() {
  _version++;
  _listeners.forEach((fn) => fn());
}

function _subscribeVersion(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function toColors(raw: string[]): [string, string] {
  const c0 = raw?.[0] ?? '#6d28d9';
  const c1 = raw?.[1] ?? '#db2777';
  return [c0, c1];
}

export function mapSong(s: ApiSong): Song {
  return {
    id: String(s.id),
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    albumId: s.albumId,
    genre: s.genre ?? '',
    duration: s.duration,
    durationMs: s.durationMs,
    track: s.track ?? undefined,
    colors: toColors(s.colors),
    lyrics: s.lyrics ?? undefined,
    imageUrl: s.imageUrl ?? undefined,
    audioUrl: s.audioUrl ?? undefined,
  };
}

function mapAlbum(a: ApiAlbum): Album {
  return {
    id: String(a.id),
    title: a.title,
    artist: a.artist,
    artistId: a.artistId,
    year: a.year,
    genre: a.genre,
    songIds: a.songIds.map(String),
    imageUrl: a.imageUrl ?? undefined,
    colors: toColors(a.colors),
  };
}

function mapArtist(a: ApiArtist): Artist {
  return {
    id: String(a.id),
    name: a.name,
    albumIds: a.albumIds.map(String),
    colors: toColors(a.colors),
  };
}

function mapPlaylist(p: ApiPlaylist): Playlist {
  return {
    id: String(p.id),
    title: p.title,
    songIds: p.songIds.map(String),
    colors: toColors(p.colors),
  };
}

export function getSongs(): Song[] { return _songs; }
export function getAlbums(): Album[] { return _albums; }
export function getArtists(): Artist[] { return _artists; }
export function getPlaylists(): Playlist[] { return _playlists; }

export function getSongPaginationInfo(): { totalCount: number; hasMore: boolean } {
  return { totalCount: _totalSongCount, hasMore: _hasMoreSongs };
}

const _songMap = new Map<string, Song>();
const _albumMap = new Map<string, Album>();
const _artistMap = new Map<string, Artist>();
const _playlistMap = new Map<string, Playlist>();

function rebuildMaps() {
  _songMap.clear();
  _albumMap.clear();
  _artistMap.clear();
  _playlistMap.clear();
  _songs.forEach((s) => _songMap.set(s.id, s));
  _albums.forEach((a) => _albumMap.set(a.id, a));
  _artists.forEach((a) => _artistMap.set(a.id, a));
  _playlists.forEach((p) => _playlistMap.set(p.id, p));
}

export function getSong(id: string): Song | undefined {
  return _songMap.get(id);
}

export function getAlbum(id: string): Album | undefined {
  return _albumMap.get(id);
}

export function getArtist(id: string): Artist | undefined {
  return _artistMap.get(id);
}

export function getPlaylist(id: string): Playlist | undefined {
  return _playlistMap.get(id);
}

export function getSongsByIds(ids: string[]): Song[] {
  return ids.map((id) => getSong(id)).filter(Boolean) as Song[];
}

export function getAlbumsByArtist(artistId: string): Album[] {
  return _albums.filter((a) => a.artistId === artistId);
}

export function searchAll(query: string): { songs: Song[]; albums: Album[]; artists: Artist[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { songs: [], albums: [], artists: [] };
  return {
    songs: _songs.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)),
    albums: _albums.filter((a) => a.title.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)),
    artists: _artists.filter((a) => a.name.toLowerCase().includes(q)),
  };
}

export async function apiSearch(q: string): Promise<{ songs: Song[]; albums: Album[]; artists: Artist[] }> {
  try {
    const token = useAuthStore.getState().token;
    const res = await api.search(q, token ?? undefined);
    return {
      songs: res.songs.map(mapSong),
      albums: res.albums.map(mapAlbum),
      artists: res.artists.map(mapArtist),
    };
  } catch {
    return searchAll(q);
  }
}

export async function apiStream(id: string): Promise<{ url: string }> {
  const { useAuthStore } = await import('@/store/authStore');
  const token = useAuthStore.getState().token;
  const res = await api.stream(id, token ?? undefined);
  return { url: res.url };
}

export function useQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[], initialData: T): QueryResult<T> {
  const hasCached = Array.isArray(initialData) ? (initialData as unknown[]).length > 0 : initialData != null;
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(!hasCached);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);
  const isFirstRef = useRef(true);

  const refetch = useCallback(() => { setTick((t) => t + 1); }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    setError(null);
    if (isFirstRef.current && hasCached) {
      setLoading(false);
      isFirstRef.current = false;
    } else {
      setLoading(true);
    }

    fetcher()
      .then((result) => {
        if (!cancelled && mountedRef.current) {
          setData(result);
          setLoading(false);
          isFirstRef.current = false;
        }
      })
      .catch((e) => {
        if (!cancelled && mountedRef.current) {
          setError(String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [...deps, tick]);

  return { data, loading, error, refetch };
}

export function useSongs(): QueryResult<Song[]> {
  const [staleData, setStaleData] = useState<Song[]>(() => getSongs());
  const staleRef = useRef(staleData);
  staleRef.current = staleData;

  useEffect(() => {
    return _subscribeVersion(() => {
      const fresh = getSongs();
      staleRef.current = fresh;
      setStaleData(fresh);
    });
  }, []);

  const { data, loading, error, refetch } = useQuery(async () => {
    const BATCH_SIZE = 100;
    let offset = 0;
    const all: Song[] = [];
    while (true) {
      const batch = await api.songs(BATCH_SIZE, offset);
      if (batch.length === 0) break;
      all.push(...batch.map(mapSong));
      offset += batch.length;
      if (batch.length < BATCH_SIZE) break;
    }
    _songs = all;
    _totalSongCount = all.length;
    _hasMoreSongs = false;
    rebuildMaps();
    _emitVersionChange();
    const fresh = getSongs();
    setStaleData(fresh);
    return fresh;
  }, [], staleData);

  const resolved = data.length > 0 ? data : staleData;
  return { data: resolved, loading: loading && resolved.length === 0, error, refetch };
}

export function useAlbums(): QueryResult<Album[]> {
  const [staleData, setStaleData] = useState<Album[]>(() => getAlbums());
  const staleRef = useRef(staleData);
  staleRef.current = staleData;

  useEffect(() => {
    return _subscribeVersion(() => {
      const fresh = getAlbums();
      staleRef.current = fresh;
      setStaleData(fresh);
    });
  }, []);

  const { data, loading, error, refetch } = useQuery(async () => {
    const raw = await api.albums();
    _albums = raw.map(mapAlbum);
    rebuildMaps();
    _emitVersionChange();
    const fresh = getAlbums();
    setStaleData(fresh);
    return fresh;
  }, [], staleData);

  const resolvedAlbums = data.length > 0 ? data : staleData;
  return { data: resolvedAlbums, loading: loading && resolvedAlbums.length === 0, error, refetch };
}

export function useArtists(): QueryResult<Artist[]> {
  const [staleData, setStaleData] = useState<Artist[]>(() => getArtists());
  const staleRef = useRef(staleData);
  staleRef.current = staleData;

  useEffect(() => {
    return _subscribeVersion(() => {
      const fresh = getArtists();
      staleRef.current = fresh;
      setStaleData(fresh);
    });
  }, []);

  const { data, loading, error, refetch } = useQuery(async () => {
    const raw = await api.artists();
    _artists = raw.map(mapArtist);
    rebuildMaps();
    _emitVersionChange();
    const fresh = getArtists();
    setStaleData(fresh);
    return fresh;
  }, [], staleData);

  const resolvedArtists = data.length > 0 ? data : staleData;
  return { data: resolvedArtists, loading: loading && resolvedArtists.length === 0, error, refetch };
}

export function usePlaylists(): QueryResult<Playlist[]> {
  const [staleData, setStaleData] = useState<Playlist[]>(() => getPlaylists());
  const staleRef = useRef(staleData);
  staleRef.current = staleData;

  useEffect(() => {
    return _subscribeVersion(() => {
      const fresh = getPlaylists();
      staleRef.current = fresh;
      setStaleData(fresh);
    });
  }, []);

  const { data, loading, error, refetch } = useQuery(async () => {
    const token = useAuthStore.getState().token;
    if (!token) return [];
    const raw = await api.playlists(token);
    _playlists = raw.map(mapPlaylist);
    rebuildMaps();
    _emitVersionChange();
    const fresh = getPlaylists();
    setStaleData(fresh);
    return fresh;
  }, [], staleData);

  const resolvedPlaylists = data.length > 0 ? data : staleData;
  return { data: resolvedPlaylists, loading: loading && resolvedPlaylists.length === 0, error, refetch };
}

export function useHome(): QueryResult<HomeResponse> {
  const token = useAuthStore((s) => s.token);
  return useQuery(async () => {
    return await api.home(token ?? undefined);
  }, [token], null as unknown as HomeResponse);
}

export function useAlbum(id: string): { data: Album | undefined; loading: boolean; error: string | null; refetch: () => void } {
  const [staleData, setStaleData] = useState<Album | undefined>(() => getAlbum(id));

  const { data, loading, error, refetch } = useQuery(async () => {
    const cached = getAlbum(id);
    if (cached) return cached;
    const raw = await api.album(id);
    const mapped = raw ? mapAlbum(raw) : undefined;
    if (mapped) setStaleData(mapped);
    return mapped;
  }, [id], staleData);

  return { data: data ?? staleData, loading, error, refetch };
}

export function useArtist(id: string): { data: Artist | undefined; loading: boolean; error: string | null; refetch: () => void } {
  const [staleData, setStaleData] = useState<Artist | undefined>(() => getArtist(id));

  const { data, loading, error, refetch } = useQuery(async () => {
    const cached = getArtist(id);
    if (cached) return cached;
    const raw = await api.artist(id);
    const mapped = raw ? mapArtist(raw) : undefined;
    if (mapped) setStaleData(mapped);
    return mapped;
  }, [id], staleData);

  return { data: data ?? staleData, loading, error, refetch };
}

export function usePlaylist(id: string): { data: Playlist | undefined; loading: boolean; error: string | null; refetch: () => void } {
  const [staleData, setStaleData] = useState<Playlist | undefined>(() => getPlaylist(id));

  const { data, loading, error, refetch } = useQuery(async () => {
    const cached = getPlaylist(id);
    if (cached) return cached;
    const raw = await api.playlist(id);
    const mapped = raw ? mapPlaylist(raw) : undefined;
    if (mapped) setStaleData(mapped);
    return mapped;
  }, [id], staleData);

  return { data: data ?? staleData, loading, error, refetch };
}

export function useSearch(query: string): { data: { songs: Song[]; albums: Album[]; artists: Artist[] }; loading: boolean; error: string | null } {
  const [results, setResults] = useState<{ songs: Song[]; albums: Album[]; artists: Artist[] }>({ songs: [], albums: [], artists: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ songs: [], albums: [], artists: [] });
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const timer = setTimeout(() => {
      apiSearch(query)
        .then((r) => { setResults(r); setLoading(false); })
        .catch((e) => { setError(String(e)); setLoading(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return { data: results, loading, error };
}
