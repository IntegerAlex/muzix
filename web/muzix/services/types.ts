export interface Song {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
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
