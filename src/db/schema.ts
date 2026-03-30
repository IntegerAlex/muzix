// Database schema and initialization for music streaming backend
// Using bun:sqlite for Bun runtime compatibility

import { Database } from "bun:sqlite";
import { v4 as uuidv4 } from "uuid";
import { join } from "path";

const DB_PATH = process.env.DB_PATH || join(process.cwd(), "storage", "music.db");

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  year: number;
  filePath: string;
  compressedPath: string;
  fileSize: number;
  compressedSize: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  artworkPath: string | null;
  playCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface Playlist {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlaylistTrack {
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: string;
}

export interface Like {
  userId: string;
  trackId: string;
  createdAt: string;
}

export interface Blend {
  id: string;
  name: string;
  creatorId: string;
  participantIds: string[];
  trackIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SearchIndex {
  trackId: string;
  searchableText: string;
}

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA cache_size = -64000"); // 64MB cache
    db.exec("PRAGMA temp_store = memory");
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(database: Database) {
  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Tracks table
  database.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT,
      duration INTEGER NOT NULL,
      genre TEXT,
      year INTEGER,
      file_path TEXT NOT NULL,
      compressed_path TEXT,
      file_size INTEGER NOT NULL,
      compressed_size INTEGER,
      bitrate INTEGER,
      sample_rate INTEGER,
      channels INTEGER,
      artwork_path TEXT,
      play_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Create indexes for performance
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks(genre);
    CREATE INDEX IF NOT EXISTS idx_tracks_title ON tracks(title);
    CREATE INDEX IF NOT EXISTS idx_tracks_year ON tracks(year);
    CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count DESC);
  `);

  // Playlists table
  database.exec(`
    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_public INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON playlists(is_public);
  `);

  // Playlist tracks junction table
  database.exec(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      added_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks(playlist_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks(track_id);
  `);

  // Likes table
  database.exec(`
    CREATE TABLE IF NOT EXISTS likes (
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, track_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id);
    CREATE INDEX IF NOT EXISTS idx_likes_track_id ON likes(track_id);
  `);

  // Blends table (collaborative playlists)
  database.exec(`
    CREATE TABLE IF NOT EXISTS blends (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      creator_id TEXT NOT NULL,
      participant_ids TEXT NOT NULL,
      track_ids TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Full-text search virtual table
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
      title,
      artist,
      album,
      genre,
      content='tracks',
      content_rowid='rowid'
    )
  `);

  // Triggers to keep FTS in sync
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS tracks_ai AFTER INSERT ON tracks BEGIN
      INSERT INTO tracks_fts(rowid, title, artist, album, genre) 
      VALUES (NEW.rowid, NEW.title, NEW.artist, NEW.album, NEW.genre);
    END;
  `);

  database.exec(`
    CREATE TRIGGER IF NOT EXISTS tracks_ad AFTER DELETE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre) 
      VALUES('delete', OLD.rowid, OLD.title, OLD.artist, OLD.album, OLD.genre);
    END;
  `);

  database.exec(`
    CREATE TRIGGER IF NOT EXISTS tracks_au AFTER UPDATE ON tracks BEGIN
      INSERT INTO tracks_fts(tracks_fts, rowid, title, artist, album, genre) 
      VALUES('delete', OLD.rowid, OLD.title, OLD.artist, OLD.album, OLD.genre);
      INSERT INTO tracks_fts(rowid, title, artist, album, genre) 
      VALUES (NEW.rowid, NEW.title, NEW.artist, NEW.album, NEW.genre);
    END;
  `);

  // Listening history for recommendations
  database.exec(`
    CREATE TABLE IF NOT EXISTS listening_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      played_at TEXT DEFAULT (datetime('now')),
      completion_percentage INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_listening_history_user_id ON listening_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_listening_history_track_id ON listening_history(track_id);
    CREATE INDEX IF NOT EXISTS idx_listening_history_played_at ON listening_history(played_at DESC);
  `);

  // User preferences for recommendations
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id TEXT PRIMARY KEY,
      preferred_genres TEXT,
      preferred_artists TEXT,
      audio_quality_preference TEXT DEFAULT 'high',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

// Helper functions
export function createTrack(data: Omit<Track, "id" | "createdAt" | "updatedAt" | "playCount">): Track {
  const id = uuidv4();
  const now = new Date().toISOString();
  return {
    ...data,
    id,
    playCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUser(data: Omit<User, "id" | "createdAt">): User {
  const id = uuidv4();
  return {
    ...data,
    id,
    createdAt: new Date().toISOString(),
  };
}

export function createPlaylist(data: Omit<Playlist, "id" | "createdAt" | "updatedAt">): Playlist {
  const id = uuidv4();
  const now = new Date().toISOString();
  return {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
  };
}
