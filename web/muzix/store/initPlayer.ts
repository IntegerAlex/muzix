import { restoreQueue, generateQueueItemId } from '@/store/playerStore';
import { getSongs } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import type { Song, QueueItem } from '@/services/types';

function findSong(id: string): Song | undefined {
  return getSongs().find((s) => s.id === id);
}

export async function initPlayer(): Promise<void> {
  const saved = await restoreQueue();
  if (!saved || saved.queue.length === 0) return;

  // Prefer the catalog copy when it's loaded (fresher colors/lyrics), but fall
  // back to the persisted full metadata so the queue renders even if the
  // catalog DB is empty (e.g. cold-start offline).
  const resolved: QueueItem[] = saved.queue.map((savedSong) => {
    const catalogSong = findSong(savedSong.id);
    if (catalogSong) {
      // Re-wrap with the same queueItemId so queue slot identity is preserved.
      return { ...catalogSong, queueItemId: savedSong.queueItemId ?? generateQueueItemId() };
    }
    return savedSong;
  });

  const clampedIndex = Math.min(saved.currentIndex, resolved.length - 1);

  usePlayerStore.setState({
    current: resolved[clampedIndex] ?? resolved[0],
    queue: resolved,
    originalQueue: resolved,
    currentIndex: clampedIndex >= 0 ? clampedIndex : 0,
  });
}
