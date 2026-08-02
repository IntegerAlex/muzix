import { setSongs, setAlbums, setArtists, setPlaylists } from '@/services/data';
import type { Song, Album, Artist, Playlist } from '@/services/types';

const DB_NAME = 'muzix';
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('albums')) db.createObjectStore('albums', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('artists')) db.createObjectStore('artists', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
    };
    request.onsuccess = () => { _db = request.result; resolve(request.result); };
    request.onerror = () => reject(request.error);
  });
}

function getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

function putAll<T extends { id: string }>(db: IDBDatabase, storeName: string, items: T[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function getMany<T extends { id: string }>(db: IDBDatabase, storeName: string, ids: string[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const results: T[] = [];
    let pending = ids.length;
    if (pending === 0) return resolve([]);
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) results.push(req.result as T);
        if (--pending === 0) resolve(results);
      };
      req.onerror = () => {
        if (--pending === 0) resolve(results);
      };
    }
  });
}

function hasKey(db: IDBDatabase, storeName: string, id: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count(id);
    req.onsuccess = () => resolve(req.result > 0);
    req.onerror = () => reject(req.error);
  });
}

function clearAll(db: IDBDatabase, storeName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function initCatalog(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    console.error('catalogDb: failed to open database', e);
    try { indexedDB.deleteDatabase(DB_NAME); } catch {}
    return;
  }

  try {
    const [songs, albums, artists, playlists] = await Promise.all([
      getAll<Song>(db, 'songs'),
      getAll<Album>(db, 'albums'),
      getAll<Artist>(db, 'artists'),
      getAll<Playlist>(db, 'playlists'),
    ]);
    setSongs(songs);
    setAlbums(albums);
    setArtists(artists);
    setPlaylists(playlists);
  } catch (e) {
    console.error('catalogDb: failed to load data', e);
    if (_db) { _db.close(); _db = null; }
    try { indexedDB.deleteDatabase(DB_NAME); } catch {}
  }
}

export async function upsertSongs(songs: Song[]): Promise<void> {
  const db = await openDb();
  await putAll(db, 'songs', songs);
}

export async function upsertAlbums(albums: Album[]): Promise<void> {
  const db = await openDb();
  await putAll(db, 'albums', albums);
}

export async function upsertArtists(artists: Artist[]): Promise<void> {
  const db = await openDb();
  await putAll(db, 'artists', artists);
}

export async function upsertPlaylists(playlists: Playlist[]): Promise<void> {
  const db = await openDb();
  await putAll(db, 'playlists', playlists);
}

export async function getSongsByIds(ids: string[]): Promise<Song[]> {
  const db = await openDb();
  return getMany<Song>(db, 'songs', ids);
}

export async function hasSong(songId: string): Promise<boolean> {
  const db = await openDb();
  return hasKey(db, 'songs', songId);
}

export async function clearCatalog(): Promise<void> {
  const db = await openDb();
  await Promise.all([
    clearAll(db, 'songs'),
    clearAll(db, 'albums'),
    clearAll(db, 'artists'),
    clearAll(db, 'playlists'),
  ]);
}
