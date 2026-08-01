export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  genre: string;
  duration: string; // mm:ss
  durationMs: number;
  /** Track number within its album. */
  track?: number;
  /** Gradient stops used to render a placeholder cover (no remote images). */
  colors: [string, string];
  lyrics?: string;
  imageUrl?: string;
  audioUrl?: string | number;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  year: number;
  genre: string;
  songIds: string[];
  imageUrl?: string;
  colors: [string, string];
}

export interface Artist {
  id: string;
  name: string;
  albumIds: string[];
  colors: [string, string];
}

export interface Playlist {
  id: string;
  title: string;
  songIds: string[];
  colors: [string, string];
}

/**
 * A Song instance inside the playback queue. `queueItemId` is a unique
 * per-slot identifier so the same song can appear multiple times in the
 * queue without React key collisions or store logic mixing them up.
 */
export type QueueItem = Song & { queueItemId: string };

export interface QueryResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
