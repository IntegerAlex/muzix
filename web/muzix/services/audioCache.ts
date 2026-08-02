const DB_NAME = 'muzix-audio';
const STORE = 'audio';
const MAX_AUTO_CACHED = 50;

let _db: IDBDatabase | null = null;
const _objectUrls = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'song_id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function getRecord(songId: string): Promise<{ song_id: string; blob: Blob; size: number; downloaded_at: number; downloaded: number } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(songId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function putRecord(record: { song_id: string; blob: Blob; size: number; downloaded_at: number; downloaded: number }): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteRecord(songId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(songId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllRecords(): Promise<Array<{ song_id: string; blob: Blob; size: number; downloaded_at: number; downloaded: number }>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function evictAutoCached(keepSongId: string): Promise<void> {
  try {
    const all = await getAllRecords();
    const autoCached = all
      .filter(r => r.downloaded === 0 && r.song_id !== keepSongId)
      .sort((a, b) => a.downloaded_at - b.downloaded_at);
    let excess = autoCached.length - MAX_AUTO_CACHED + 5;
    for (const rec of autoCached) {
      if (excess <= 0) break;
      const url = _objectUrls.get(rec.song_id);
      if (url) { URL.revokeObjectURL(url); _objectUrls.delete(rec.song_id); }
      await deleteRecord(rec.song_id);
      excess--;
    }
  } catch {}
}

export async function downloadToCache(songId: string, url: string): Promise<string> {
  // On web, skip blob caching — R2 presigned URLs need CORS headers for fetch(),
  // but <audio> elements play cross-origin URLs fine without CORS.
  // The URL is returned directly; metadata/catalog offline is the core feature.
  return url;
}

export async function getCachedAudioPath(songId: string): Promise<string | null> {
  try {
    const existing = await getRecord(songId);
    if (!existing?.blob || existing.blob.size === 0) return null;
    if (!_objectUrls.has(songId)) _objectUrls.set(songId, URL.createObjectURL(existing.blob));
    return _objectUrls.get(songId)!;
  } catch {
    return null;
  }
}

export async function removeCachedAudio(songId: string): Promise<void> {
  try {
    const url = _objectUrls.get(songId);
    if (url) { URL.revokeObjectURL(url); _objectUrls.delete(songId); }
    await deleteRecord(songId);
  } catch {}
}

export async function getCachedAudioSize(): Promise<number> {
  try {
    const all = await getAllRecords();
    return all.reduce((sum, r) => sum + r.size, 0);
  } catch {
    return 0;
  }
}

export async function isDownloaded(songId: string): Promise<boolean> {
  try {
    const rec = await getRecord(songId);
    return rec?.downloaded === 1;
  } catch {
    return false;
  }
}

export async function getDownloadedSongs(): Promise<string[]> {
  try {
    const all = await getAllRecords();
    return all.filter(r => r.downloaded === 1).map(r => r.song_id);
  } catch {
    return [];
  }
}

export async function markDownloaded(songId: string): Promise<void> {
  try {
    const existing = await getRecord(songId);
    if (existing) {
      await putRecord({ ...existing, downloaded: 1 });
    } else {
      await putRecord({ song_id: songId, blob: new Blob([]), size: 0, downloaded_at: Date.now(), downloaded: 1 });
    }
  } catch {}
}

export async function unmarkDownloaded(songId: string): Promise<void> {
  try {
    const existing = await getRecord(songId);
    if (existing) {
      await putRecord({ ...existing, downloaded: 0 });
    }
  } catch {}
}
