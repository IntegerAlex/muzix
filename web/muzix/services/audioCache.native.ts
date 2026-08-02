import { Platform } from 'react-native';

const MAX_AUTO_CACHED = 50;
let _db: any = null;

async function getDb() {
  if (_db) return _db;
  const SQLite = require('expo-sqlite');
  _db = await SQLite.openDatabaseAsync('muzix-audio.db');
  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS audio_cache (
      song_id TEXT PRIMARY KEY,
      local_uri TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      downloaded_at INTEGER NOT NULL,
      downloaded INTEGER NOT NULL DEFAULT 0
    );
  `);
  try {
    await _db.execAsync(`ALTER TABLE audio_cache ADD COLUMN downloaded INTEGER NOT NULL DEFAULT 0`);
  } catch {}
  return _db;
}

function getAudioDir(): string {
  const FileSystem = require('expo-file-system');
  return `${FileSystem.documentDirectory}muzix-audio/`;
}

async function deleteFile(uri: string): Promise<void> {
  try {
    const FileSystem = require('expo-file-system');
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri);
  } catch {}
}

async function evictOldEntries(keepSongId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const count: any = await db.getFirstAsync('SELECT COUNT(*) as c FROM audio_cache WHERE downloaded = 0');
    if (!count || count.c < MAX_AUTO_CACHED) return;

    const excess = count.c - MAX_AUTO_CACHED + 5;
    const rows: any[] = await db.getAllAsync(
      'SELECT song_id, local_uri FROM audio_cache WHERE downloaded = 0 AND song_id != ? ORDER BY downloaded_at ASC LIMIT ?',
      keepSongId, excess
    );
    for (const row of rows) {
      await deleteFile(row.local_uri);
      await db.runAsync('DELETE FROM audio_cache WHERE song_id = ?', row.song_id);
    }
  } catch {}
}

export async function downloadToCache(songId: string, url: string): Promise<string> {
  try {
    const FileSystem = require('expo-file-system');
    const audioDir = getAudioDir();
    const info = await FileSystem.getInfoAsync(audioDir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });

    const db = await getDb();
    if (db) {
      const row: any = await db.getFirstAsync(
        'SELECT local_uri FROM audio_cache WHERE song_id = ?', songId
      );
      if (row) {
        const fileCheck = await FileSystem.getInfoAsync(row.local_uri);
        if (fileCheck.exists) {
          await db.runAsync(
            'UPDATE audio_cache SET downloaded_at = ? WHERE song_id = ?',
            Date.now(), songId
          );
          return row.local_uri;
        }
        await deleteFile(row.local_uri);
        await db.runAsync('DELETE FROM audio_cache WHERE song_id = ?', songId);
      }
    }

    const filePath = `${audioDir}${songId}.m4a`;
    const downloaded = await FileSystem.downloadAsync(url, filePath);
    const fileInfo = await FileSystem.getInfoAsync(filePath);

    if (db && fileInfo.exists) {
      await db.runAsync(
        'INSERT OR REPLACE INTO audio_cache (song_id, local_uri, size, downloaded_at, downloaded) VALUES (?, ?, ?, ?, 0)',
        songId, filePath, fileInfo.size ?? 0, Date.now()
      );
      await evictOldEntries(songId);
    }
    return downloaded.uri;
  } catch {
    return url;
  }
}

export async function getCachedAudioPath(songId: string): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const row: any = await db.getFirstAsync(
      'SELECT local_uri FROM audio_cache WHERE song_id = ?', songId
    );
    if (!row) return null;
    const FileSystem = require('expo-file-system');
    const info = await FileSystem.getInfoAsync(row.local_uri);
    if (!info.exists) {
      await deleteFile(row.local_uri);
      await db.runAsync('DELETE FROM audio_cache WHERE song_id = ?', songId);
      return null;
    }
    return row.local_uri;
  } catch {
    return null;
  }
}

export async function removeCachedAudio(songId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const row: any = await db.getFirstAsync(
      'SELECT local_uri FROM audio_cache WHERE song_id = ?', songId
    );
    if (row) {
      await deleteFile(row.local_uri);
      await db.runAsync('DELETE FROM audio_cache WHERE song_id = ?', songId);
    }
  } catch {}
}

export async function getCachedAudioSize(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return 0;
    const row: any = await db.getFirstAsync('SELECT COALESCE(SUM(size), 0) as total FROM audio_cache');
    return row?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function isDownloaded(songId: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const row: any = await db.getFirstAsync(
      'SELECT downloaded FROM audio_cache WHERE song_id = ?', songId
    );
    return row?.downloaded === 1;
  } catch {
    return false;
  }
}

export async function getDownloadedSongs(): Promise<string[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    const rows: any[] = await db.getAllAsync(
      'SELECT song_id FROM audio_cache WHERE downloaded = 1'
    );
    return rows.map(r => r.song_id);
  } catch {
    return [];
  }
}

export async function markDownloaded(songId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const row: any = await db.getFirstAsync(
      'SELECT song_id FROM audio_cache WHERE song_id = ?', songId
    );
    if (row) {
      await db.runAsync(
        'UPDATE audio_cache SET downloaded = 1 WHERE song_id = ?', songId
      );
    } else {
      // markDownloaded was called without a prior downloadToCache — verify the
      // file actually exists before writing the record, so isDownloaded() never
      // returns true for a phantom path.
      const audioDir = getAudioDir();
      const filePath = `${audioDir}${songId}.m4a`;
      const FileSystem = require('expo-file-system');
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) return;
      await db.runAsync(
        'INSERT OR REPLACE INTO audio_cache (song_id, local_uri, size, downloaded_at, downloaded) VALUES (?, ?, ?, ?, 1)',
        songId, filePath, fileInfo.size ?? 0, Date.now()
      );
    }
  } catch {}
}

export async function unmarkDownloaded(songId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      'UPDATE audio_cache SET downloaded = 0 WHERE song_id = ?', songId
    );
  } catch {}
}
