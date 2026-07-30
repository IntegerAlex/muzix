jest.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: jest.fn().mockReturnValue({ token: null }),
  },
}));

import { usePlayerStore } from '@/store/playerStore';

function makeSong(id: string, title = `Song ${id}`): any {
  return { id, title, artist: 'Artist', artistId: 'a1', album: 'Album', albumId: 'al1', duration: '3:00', durationMs: 180000, colors: ['#1DB954', '#0a0a0a'] };
}

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

describe('playSong', () => {
  it('sets current song and marks playing', () => {
    const song = makeSong('1');
    usePlayerStore.getState().playSong(song);
    const state = usePlayerStore.getState();
    expect(state.current).toEqual(song);
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
    expect(state.queue).toEqual([song]);
  });
});

describe('setPlaying', () => {
  it('toggles isPlaying', () => {
    usePlayerStore.getState().setPlaying(true);
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    usePlayerStore.getState().setPlaying(false);
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});

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

describe('toggleShuffle', () => {
  it('shuffles queue when enabling', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3'), makeSong('4')];
    usePlayerStore.getState().playSong(songs[1], songs, 1);
    usePlayerStore.getState().toggleShuffle();
    const state = usePlayerStore.getState();
    expect(state.shuffle).toBe(true);
    expect(state.queue[0]?.id).toBe('2');
    expect(state.currentIndex).toBe(0);
    expect(state.history).toEqual([]);
  });

  it('restores original queue when disabling', () => {
    const songs = [makeSong('1'), makeSong('2'), makeSong('3')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    usePlayerStore.getState().toggleShuffle();
    usePlayerStore.getState().toggleShuffle();
    const state = usePlayerStore.getState();
    expect(state.shuffle).toBe(false);
    expect(state.queue.map((s: any) => s.id)).toEqual(['1', '2', '3']);
  });

  it('keeps current song first after shuffle', () => {
    const songs = [makeSong('a'), makeSong('b'), makeSong('c'), makeSong('d')];
    usePlayerStore.getState().playSong(songs[2], songs, 2);
    usePlayerStore.getState().toggleShuffle();
    expect(usePlayerStore.getState().queue[0].id).toBe('c');
  });
});

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

describe('addToQueue', () => {
  it('appends song to queue', () => {
    const songs = [makeSong('1')];
    usePlayerStore.getState().playSong(songs[0], songs, 0);
    const extra = makeSong('99');
    usePlayerStore.getState().addToQueue(extra);
    expect(usePlayerStore.getState().queue).toHaveLength(2);
    expect(usePlayerStore.getState().queue[1].id).toBe('99');
  });
});

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
