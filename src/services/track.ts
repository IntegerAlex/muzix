// Track management service
import { getDb, type Track } from "../db/schema";
import {
  compressAudio,
  storeAudioFile,
  createChunks,
  deleteTrackFiles,
  type AudioMetadata,
} from "./storage";
import type { BunFile } from "bun";

export interface CreateTrackInput {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  year?: number;
  file: BunFile;
  artworkFile?: BunFile;
}

export interface UpdateTrackInput {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: number;
}

export class TrackService {
  /**
   * Create a new track with file upload and compression
   */
  async create(input: CreateTrackInput): Promise<Track> {
    const db = getDb();
    const { v4: uuidv4 } = await import("uuid");
    const trackId = uuidv4();

    try {
      // Store original audio file
      const { path: originalPath, size: originalSize } = await storeAudioFile(
        input.file,
        trackId
      );

      // Compress audio
      const compressionResult = await compressAudio(originalPath, trackId, "ogg");

      // Store artwork if provided
      let artworkPath: string | null = null;
      if (input.artworkFile) {
        const { storeArtwork } = await import("./storage");
        artworkPath = await storeArtwork(input.artworkFile, trackId);
      }

      // Create chunks for streaming
      await createChunks(compressionResult.compressedPath, trackId);

      // Insert track into database
      const stmt = db.prepare(`
        INSERT INTO tracks (
          id, title, artist, album, duration, genre, year,
          file_path, compressed_path, file_size, compressed_size,
          bitrate, sample_rate, channels, artwork_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const metadata = compressionResult.metadata;
      stmt.run(
        trackId,
        input.title || metadata.title,
        input.artist || metadata.artist,
        input.album || metadata.album || "",
        Math.round(metadata.duration),
        input.genre || metadata.genre || "",
        input.year || metadata.year || new Date().getFullYear(),
        originalPath,
        compressionResult.compressedPath,
        originalSize,
        compressionResult.compressedSize,
        metadata.bitrate,
        metadata.sampleRate,
        metadata.channels,
        artworkPath
      );

      return this.getById(trackId);
    } catch (error) {
      // Cleanup on failure
      await deleteTrackFiles(trackId, {
        original: undefined,
        compressed: undefined,
        artwork: undefined,
      });
      throw error;
    }
  }

  /**
   * Get track by ID
   */
  getById(id: string): Track {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM tracks WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) {
      throw new Error("Track not found");
    }

    return this.mapRowToTrack(row);
  }

  /**
   * Get multiple tracks by IDs
   */
  getByIds(ids: string[]): Track[] {
    const db = getDb();
    const placeholders = ids.map(() => "?").join(",");
    const stmt = db.prepare(`SELECT * FROM tracks WHERE id IN (${placeholders})`);
    const rows = stmt.all(...ids) as any[];

    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Update track metadata
   */
  update(id: string, input: UpdateTrackInput): Track {
    const db = getDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (input.title !== undefined) {
      updates.push("title = ?");
      values.push(input.title);
    }
    if (input.artist !== undefined) {
      updates.push("artist = ?");
      values.push(input.artist);
    }
    if (input.album !== undefined) {
      updates.push("album = ?");
      values.push(input.album);
    }
    if (input.genre !== undefined) {
      updates.push("genre = ?");
      values.push(input.genre);
    }
    if (input.year !== undefined) {
      updates.push("year = ?");
      values.push(input.year);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = db.prepare(`
      UPDATE tracks 
      SET ${updates.join(", ")} 
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getById(id);
  }

  /**
   * Delete track
   */
  delete(id: string): void {
    const db = getDb();
    const track = this.getById(id);

    // Delete files
    deleteTrackFiles(id, {
      original: track.filePath,
      compressed: track.compressedPath,
      artwork: track.artworkPath,
    });

    // Delete from database
    const stmt = db.prepare("DELETE FROM tracks WHERE id = ?");
    stmt.run(id);
  }

  /**
   * Increment play count
   */
  incrementPlayCount(id: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      UPDATE tracks 
      SET play_count = play_count + 1, updated_at = datetime('now') 
      WHERE id = ?
    `);
    stmt.run(id);
  }

  /**
   * Get popular tracks
   */
  getPopular(limit: number = 20): Track[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM tracks 
      ORDER BY play_count DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Get recent tracks
   */
  getRecent(limit: number = 20): Track[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM tracks 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Get tracks by artist
   */
  getByArtist(artist: string, limit: number = 50): Track[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM tracks 
      WHERE artist LIKE ? 
      ORDER BY title 
      LIMIT ?
    `);
    const rows = stmt.all(`%${artist}%`, limit) as any[];
    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Get tracks by genre
   */
  getByGenre(genre: string, limit: number = 50): Track[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM tracks 
      WHERE genre LIKE ? 
      ORDER BY title 
      LIMIT ?
    `);
    const rows = stmt.all(`%${genre}%`, limit) as any[];
    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Search tracks using full-text search
   */
  search(query: string, limit: number = 50): Track[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.* FROM tracks t
      INNER JOIN tracks_fts fts ON t.rowid = fts.rowid
      WHERE tracks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);
    const rows = stmt.all(query, limit) as any[];
    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Simple search fallback
   */
  searchSimple(query: string, limit: number = 50): Track[] {
    const db = getDb();
    const searchTerm = `%${query}%`;
    const stmt = db.prepare(`
      SELECT * FROM tracks 
      WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?
      ORDER BY play_count DESC
      LIMIT ?
    `);
    const rows = stmt.all(searchTerm, searchTerm, searchTerm, limit) as any[];
    return rows.map((row) => this.mapRowToTrack(row));
  }

  /**
   * Get all tracks (paginated)
   */
  getAll(page: number = 1, pageSize: number = 50): { tracks: Track[]; total: number } {
    const db = getDb();
    const offset = (page - 1) * pageSize;

    const countStmt = db.prepare("SELECT COUNT(*) as count FROM tracks");
    const { count: total } = countStmt.get() as { count: number };

    const stmt = db.prepare(`
      SELECT * FROM tracks 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(pageSize, offset) as any[];

    return {
      tracks: rows.map((row) => this.mapRowToTrack(row)),
      total,
    };
  }

  private mapRowToTrack(row: any): Track {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      duration: row.duration,
      genre: row.genre,
      year: row.year,
      filePath: row.file_path,
      compressedPath: row.compressed_path,
      fileSize: row.file_size,
      compressedSize: row.compressed_size,
      bitrate: row.bitrate,
      sampleRate: row.sample_rate,
      channels: row.channels,
      artworkPath: row.artwork_path,
      playCount: row.play_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const trackService = new TrackService();
