import * as SQLite from 'expo-sqlite';
import { setSongs, setAlbums, setArtists, setPlaylists } from '@/services/data';
import type { Song, Album, Artist, Playlist } from '@/services/types';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync('muzix.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS artists (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS playlists (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  `);
  return _db;
}

export async function initCatalog(): Promise<void> {
  let db: SQLite.SQLiteDatabase;
  try {
    db = await getDb();
  } catch (e) {
    console.error('catalogDb: failed to open database', e);
    _db = null;
    return;
  }

  try {
    const [songs, albums, artists, playlists] = await Promise.all([
      db.getAllAsync<{ data: string }>('SELECT data FROM songs'),
      db.getAllAsync<{ data: string }>('SELECT data FROM albums'),
      db.getAllAsync<{ data: string }>('SELECT data FROM artists'),
      db.getAllAsync<{ data: string }>('SELECT data FROM playlists'),
    ]);
    setSongs(songs.map((r) => JSON.parse(r.data)));
    setAlbums(albums.map((r) => JSON.parse(r.data)));
    setArtists(artists.map((r) => JSON.parse(r.data)));
    setPlaylists(playlists.map((r) => JSON.parse(r.data)));
  } catch (e) {
    console.error('catalogDb: failed to load data', e);
    _db = null;
  }
}

export async function upsertSongs(songs: Song[]): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const song of songs) {
      await tx.runAsync('INSERT OR REPLACE INTO songs (id, data) VALUES (?, ?)', song.id, JSON.stringify(song));
    }
  });
}

export async function upsertAlbums(albums: Album[]): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const album of albums) {
      await tx.runAsync('INSERT OR REPLACE INTO albums (id, data) VALUES (?, ?)', album.id, JSON.stringify(album));
    }
  });
}

export async function upsertArtists(artists: Artist[]): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const artist of artists) {
      await tx.runAsync('INSERT OR REPLACE INTO artists (id, data) VALUES (?, ?)', artist.id, JSON.stringify(artist));
    }
  });
}

export async function upsertPlaylists(playlists: Playlist[]): Promise<void> {
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const playlist of playlists) {
      await tx.runAsync('INSERT OR REPLACE INTO playlists (id, data) VALUES (?, ?)', playlist.id, JSON.stringify(playlist));
    }
  });
}

export async function getSongsByIds(ids: string[]): Promise<Song[]> {
  const db = await getDb();
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ data: string }>(`SELECT data FROM songs WHERE id IN (${placeholders})`, ...ids);
  return rows.map((r) => JSON.parse(r.data));
}

export async function hasSong(songId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ id: string }>('SELECT 1 FROM songs WHERE id = ? LIMIT 1', songId);
  return row != null;
}

export async function clearCatalog(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM songs; DELETE FROM albums; DELETE FROM artists; DELETE FROM playlists;');
}
