jest.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ token: null }),
  },
}));

import { usePlayerStore } from '@/store/playerStore';
import type { QueueItem } from '@/services/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSong(id: string, title = `Song ${id}`): any {
  return { id, title, artist: 'Artist', artistId: 'a1', album: 'Album', albumId: 'al1', duration: '3:00', durationMs: 180000, colors: ['#1DB954', '#0a0a0a'] };
}

/** Extract song IDs from the current queue (QueueItem[]). */
function queueIds(): string[] {
  return usePlayerStore.getState().queue.map((s: QueueItem) => s.id);
}

// ---------------------------------------------------------------------------
// Reset before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  usePlayerStore.setState({
    current: null,
    queue: [],
    originalQueue: [],
    currentIndex: -1,
    isPlaying: false,
    loadingId: null,
    showNowPlaying: false,
    shuffle: false,
    repeat: 'off',
    history: [],
    likedSongs: {},
    volume: 0.7,
    seekPosition: null,
  });
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// playSong
// ---------------------------------------------------------------------------

describe('playSong', () => {
  it('sets current song and marks playing', () => {
    const song = makeSong('1');
    usePlayerStore.getState().playSong(song);
    const state = usePlayerStore.getState();
    expect(state.current).toMatchObject({ id: '1' });
    expect(state.isPlaying).toBe(true);
    expect(state.currentIndex).toBe(0);
  });

  it('places song at correct index when queue provided', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[2], songs, 2);
    const state = usePlayerStore.getState();
    expect(state.current?.id).toBe('3');
    expect(state.currentIndex).toBe(2);
  });

  it('resolves index from queue when index not provided', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[1], songs);
    const state = usePlayerStore.getState();
    expect(state.currentIndex).toBe(1);
  });

  it('uses song as sole queue entry when no queue provided', () => {
    const song = makeSong('solo');
    usePlayerStore.getState().playSong(song);
    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].id).toBe('solo');
  });

  it('wraps plain songs into QueueItems with unique queueItemIds', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const { queue } = usePlayerStore.getState();
    // Every slot must have a non-empty queueItemId
    queue.forEach((item: QueueItem) => {
      expect(typeof item.queueItemId).toBe('string');
      expect(item.queueItemId.length).toBeGreaterThan(0);
    });
    // All queueItemIds must be unique
    const ids = queue.map((item: QueueItem) => item.queueItemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('assigns distinct queueItemIds when the same song appears multiple times', () => {
    const song = makeSong('dup');
    usePlayerStore.getState().playSong(song);
    usePlayerStore.getState().addToQueue(song);
    usePlayerStore.getState().addToQueue(song);
    const { queue } = usePlayerStore.getState();
    expect(queue).toHaveLength(3);
    const ids = queue.map((item: QueueItem) => item.queueItemId);
    expect(new Set(ids).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// setPlaying
// ---------------------------------------------------------------------------

describe('setPlaying', () => {
  it('toggles isPlaying', () => {
    usePlayerStore.getState().setPlaying(true);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    usePlayerStore.getState().setPlaying(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// next
// ---------------------------------------------------------------------------

describe('next', () => {
  it('advances to next song in queue', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().next();
    const state = usePlayerStore.getState();
    expect(state.current?.id).toBe('2');
    expect(state.currentIndex).toBe(1);
  });

  it('adds previous index to history', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().next();
    expect(usePlayerStore.getState().history).toContain(0);
  });

  it('wraps to start when repeat is all and at end', () => {
    const songs = [makeSong('1'), makeSong('2')];
    usePlayerStore.getState().playSong(songs[1], songs, 1);
    usePlayerStore.getState().toggleRepeat();
    usePlayerStore.getState().next();
    const state = usePlayerStore.getState();
    expect(state.current?.id).toBe('1');
    expect(state.currentIndex).toBe(0);
  });

  it('does nothing when at end with repeat off', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().next();
    const state = usePlayerStore.getState();
    expect(state.current?.id).toBe('1');
    expect(state.currentIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// previous
// ---------------------------------------------------------------------------

describe('previous', () => {
  it('goes to previous song via history', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().next();
    usePlayerStore.getState().next();
    usePlayerStore.getState().previous();
    const state = usePlayerStore.getState();
    expect(state.current?.id).toBe('2');
    expect(state.currentIndex).toBe(1);
  });

  it('goes to previous index when no history', () => {
    const songs = [makeSong('1'), makeSong('2')];
    usePlayerStore.getState().playSong(songs[1], songs, 1);
    usePlayerStore.getState().previous();
    const state = usePlayerStore.getState();
    expect(state.current?.id).toBe('1');
    expect(state.currentIndex).toBe(0);
  });

  it('stays at index 0 when at start', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().previous();
    const state = usePlayerStore.getState();
    expect(state.currentIndex).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// toggleShuffle
// ---------------------------------------------------------------------------

describe('toggleShuffle', () => {
  it('shuffles queue when enabling', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3'), makeSong('4')];
    usePlayerStore.getState().playSong(songs[1], songs, 1);
    usePlayerStore.getState().toggleShuffle();
    const state = usePlayerStore.getState();
    expect(state.shuffle).toBe(true);
    // Current song must be pinned to slot 0
    expect(state.queue[0]?.id).toBe('2');
    expect(state.currentIndex).toBe(0);
    expect(state.history).toEqual([]);
  });

  it('restores original queue order when disabling', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().toggleShuffle();
    usePlayerStore.getState().toggleShuffle();
    const state = usePlayerStore.getState();
    expect(state.shuffle).toBe(false);
    expect(state.queue.map((s: QueueItem) => s.id)).toEqual(['1', '2', '3']);
  });

  it('keeps current song first after shuffle', () => {
    const songs = [makeSong('a'), makeSong('b'), makeSong('c'), makeSong('d')];
    usePlayerStore.getState().playSong(songs[2], songs, 2);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().queue[0].id).toBe('c');
  });

  it('preserves queueItemId of the pinned current song across shuffle', () => {
    const songs = [makeSong('a'), makeSong('b'), makeSong('c')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const originalQueueItemId = usePlayerStore.getState().queue[0].queueItemId;
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().queue[0].queueItemId).toBe(originalQueueItemId);
  });
});

// ---------------------------------------------------------------------------
// toggleRepeat
// ---------------------------------------------------------------------------

describe('toggleRepeat', () => {
  it('cycles off -> all -> one -> off', () => {
    expect(usePlayerStore.getState().repeat).toBe('off');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('all');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('one');
    usePlayerStore.getState().toggleRepeat();
    expect(usePlayerStore.getState().repeat).toBe('off');
  });
});

// ---------------------------------------------------------------------------
// volume / seekPosition
// ---------------------------------------------------------------------------

describe('volume', () => {
  it('sets volume', () => {
    usePlayerStore.getState().setVolume(0.5);
    expect(usePlayerStore.getState().volume).toBe(0.5);
  });
});

describe('seekPosition', () => {
  it('sets seekPosition', () => {
    const song = makeSong('1');
    usePlayerStore.getState().playSong(song);
    usePlayerStore.getState().setSeekPosition(0.5);
    expect(usePlayerStore.getState().seekPosition).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// addToQueue
// ---------------------------------------------------------------------------

describe('addToQueue', () => {
  it('appends song to queue', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const extra = makeSong('99');
    usePlayerStore.getState().addToQueue(extra);
    expect(usePlayerStore.getState().queue).toHaveLength(2);
    expect(usePlayerStore.getState().queue[1].id).toBe('99');
  });

  it('assigns a unique queueItemId to each appended duplicate', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const dup = makeSong('1');
    usePlayerStore.getState().addToQueue(dup);
    const { queue } = usePlayerStore.getState();
    expect(queue).toHaveLength(2);
    expect(queue[0].id).toBe('1');
    expect(queue[1].id).toBe('1');
    expect(queue[0].queueItemId).not.toBe(queue[1].queueItemId);
  });
});

// ---------------------------------------------------------------------------
// playNext
// ---------------------------------------------------------------------------

describe('playNext', () => {
  it('inserts song after current index', () => {
    const songs = [makeSong('1'), makeSong('2')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const extra = makeSong('99');
    usePlayerStore.getState().playNext(extra);
    const q = usePlayerStore.getState().queue;
    expect(q[1].id).toBe('99');
    expect(q[2].id).toBe('2');
  });
});

// ---------------------------------------------------------------------------
// removeFromQueue
// ---------------------------------------------------------------------------

describe('removeFromQueue', () => {
  it('removes a song by queueItemId', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const { queue } = usePlayerStore.getState();
    const idToRemove = queue[1].queueItemId;
    usePlayerStore.getState().removeFromQueue(idToRemove);
    expect(queueIds()).toEqual(['1', '3']);
  });

  it('removes only the targeted duplicate, leaving the other intact', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const dup = makeSong('1');
    usePlayerStore.getState().addToQueue(dup);
    usePlayerStore.getState().addToQueue(dup);
    const { queue } = usePlayerStore.getState();
    expect(queue).toHaveLength(3);

    // Remove only the second instance (index 1)
    usePlayerStore.getState().removeFromQueue(queue[1].queueItemId);
    const after = usePlayerStore.getState().queue;
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe('1');
    expect(after[1].id).toBe('1');
    // Confirm the surviving slots still have distinct IDs
    expect(after[0].queueItemId).not.toBe(after[1].queueItemId);
  });

  it('clears queue when removing the last song', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const { queue } = usePlayerStore.getState();
    usePlayerStore.getState().removeFromQueue(queue[0].queueItemId);
    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(0);
    expect(state.current).toBeNull();
    expect(state.isPlaying).toBe(false);
  });

  it('adjusts currentIndex when removing a song before the current slot', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[2], songs, 2); // current = index 2
    const { queue } = usePlayerStore.getState();
    usePlayerStore.getState().removeFromQueue(queue[0].queueItemId); // remove index 0
    expect(usePlayerStore.getState().currentIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// reorderQueue
// ---------------------------------------------------------------------------

describe('reorderQueue', () => {
  it('moves a slot from one position to another', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().reorderQueue(2, 0);
    expect(queueIds()).toEqual(['3', '1', '2']);
  });

  it('updates currentIndex when the current slot is moved', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0); // current at 0
    usePlayerStore.getState().reorderQueue(0, 2);
    expect(usePlayerStore.getState().currentIndex).toBe(2);
  });

  it('preserves queueItemIds during reorder', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const before = usePlayerStore.getState().queue.map((s: QueueItem) => s.queueItemId);
    // Move index 0 to index 2: [A,B,C] → [B,C,A]
    usePlayerStore.getState().reorderQueue(0, 2);
    const after = usePlayerStore.getState().queue.map((s: QueueItem) => s.queueItemId);
    // Same set of IDs (none were created or destroyed)
    expect(after.sort()).toEqual(before.sort());
    // Song IDs are in the reordered position
    expect(usePlayerStore.getState().queue.map((s: QueueItem) => s.id)).toEqual(['2', '3', '1']);
  });
});
