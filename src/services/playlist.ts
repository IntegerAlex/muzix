// Playlist and Like management service
import { getDb, type Playlist, type PlaylistTrack, type Like } from "../db/schema";

export interface CreatePlaylistInput {
  userId: string;
  name: string;
  description?: string;
  isPublic?: boolean;
}

export interface AddTrackToPlaylistInput {
  playlistId: string;
  trackId: string;
}

export class PlaylistService {
  /**
   * Create a new playlist
   */
  create(input: CreatePlaylistInput): Playlist {
    const db = getDb();
    const { v4: uuidv4 } = require("uuid");
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO playlists (id, user_id, name, description, is_public, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.userId,
      input.name,
      input.description || null,
      input.isPublic ? 1 : 0,
      now,
      now
    );

    return this.getById(id);
  }

  /**
   * Get playlist by ID
   */
  getById(id: string): Playlist {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM playlists WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) {
      throw new Error("Playlist not found");
    }

    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get playlist with tracks
   */
  getByIdWithTracks(id: string): Playlist & { tracks: any[] } {
    const playlist = this.getById(id);
    const tracks = this.getTracks(id);
    return { ...playlist, tracks };
  }

  /**
   * Get all tracks in a playlist
   */
  getTracks(playlistId: string): any[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.*, pt.position, pt.added_at
      FROM playlist_tracks pt
      INNER JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ?
      ORDER BY pt.position
    `);

    const rows = stmt.all(playlistId) as any[];
    return rows.map((row) => ({
      ...row,
      filePath: row.file_path,
      compressedPath: row.compressed_path,
      fileSize: row.file_size,
      compressedSize: row.compressed_size,
      sampleRate: row.sample_rate,
      artworkPath: row.artwork_path,
      playCount: row.play_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Update playlist
   */
  update(id: string, input: Partial<CreatePlaylistInput>): Playlist {
    const db = getDb();

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      values.push(input.name);
    }
    if (input.description !== undefined) {
      updates.push("description = ?");
      values.push(input.description);
    }
    if (input.isPublic !== undefined) {
      updates.push("is_public = ?");
      values.push(input.isPublic ? 1 : 0);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = db.prepare(`
      UPDATE playlists
      SET ${updates.join(", ")}
      WHERE id = ?
    `);

    stmt.run(...values);
    return this.getById(id);
  }

  /**
   * Delete playlist
   */
  delete(id: string): void {
    const db = getDb();
    const stmt = db.prepare("DELETE FROM playlists WHERE id = ?");
    stmt.run(id);
  }

  /**
   * Add track to playlist
   */
  addTrack(input: AddTrackToPlaylistInput): void {
    const db = getDb();
    const now = new Date().toISOString();

    // Get current max position
    const maxPosStmt = db.prepare(`
      SELECT COALESCE(MAX(position), -1) as max_position
      FROM playlist_tracks
      WHERE playlist_id = ?
    `);
    const { max_position } = maxPosStmt.get(input.playlistId) as { max_position: number };
    const newPosition = max_position + 1;

    // Insert or update position
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO playlist_tracks (playlist_id, track_id, position, added_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(input.playlistId, input.trackId, newPosition, now);
  }

  /**
   * Remove track from playlist
   */
  removeTrack(playlistId: string, trackId: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      DELETE FROM playlist_tracks
      WHERE playlist_id = ? AND track_id = ?
    `);
    stmt.run(playlistId, trackId);
  }

  /**
   * Reorder tracks in playlist
   */
  reorderTracks(playlistId: string, trackIds: string[]): void {
    const db = getDb();

    const updateStmt = db.prepare(`
      UPDATE playlist_tracks
      SET position = ?
      WHERE playlist_id = ? AND track_id = ?
    `);

    const tx = db.transaction((ids: string[]) => {
      ids.forEach((trackId, index) => {
        updateStmt.run(index, playlistId, trackId);
      });
    });

    tx(trackIds);
  }

  /**
   * Get user's playlists
   */
  getByUser(userId: string, includeTracks: boolean = false): Playlist[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM playlists
      WHERE user_id = ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(userId) as any[];
    const playlists = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      isPublic: row.is_public === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    if (includeTracks) {
      return playlists.map((playlist) => ({
        ...playlist,
        tracks: this.getTracks(playlist.id),
      }));
    }

    return playlists;
  }

  /**
   * Get public playlists
   */
  getPublic(limit: number = 50): Playlist[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT p.*, u.username as creator_name
      FROM playlists p
      INNER JOIN users u ON p.user_id = u.id
      WHERE p.is_public = 1
      ORDER BY p.created_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as any[];
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      isPublic: true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }
}

export class LikeService {
  /**
   * Like a track
   */
  like(userId: string, trackId: string): Like {
    const db = getDb();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO likes (user_id, track_id, created_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(userId, trackId, now);
    return { userId, trackId, createdAt: now };
  }

  /**
   * Unlike a track
   */
  unlike(userId: string, trackId: string): void {
    const db = getDb();
    const stmt = db.prepare(`
      DELETE FROM likes
      WHERE user_id = ? AND track_id = ?
    `);
    stmt.run(userId, trackId);
  }

  /**
   * Check if user liked a track
   */
  isLiked(userId: string, trackId: string): boolean {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM likes
      WHERE user_id = ? AND track_id = ?
    `);
    const { count } = stmt.get(userId, trackId) as { count: number };
    return count > 0;
  }

  /**
   * Get user's liked tracks
   */
  getUserLikes(userId: string): any[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT t.*, l.created_at as liked_at
      FROM likes l
      INNER JOIN tracks t ON l.track_id = t.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `);

    const rows = stmt.all(userId) as any[];
    return rows.map((row) => ({
      ...row,
      filePath: row.file_path,
      compressedPath: row.compressed_path,
      fileSize: row.file_size,
      compressedSize: row.compressed_size,
      sampleRate: row.sample_rate,
      artworkPath: row.artwork_path,
      playCount: row.play_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      likedAt: row.liked_at,
    }));
  }

  /**
   * Get track like count
   */
  getLikeCount(trackId: string): number {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM likes
      WHERE track_id = ?
    `);
    const { count } = stmt.get(trackId) as { count: number };
    return count;
  }

  /**
   * Get users who liked a track
   */
  getUsersWhoLiked(trackId: string): string[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT u.username
      FROM likes l
      INNER JOIN users u ON l.user_id = u.id
      WHERE l.track_id = ?
    `);

    const rows = stmt.all(trackId) as any[];
    return rows.map((row) => row.username);
  }
}

export const playlistService = new PlaylistService();
export const likeService = new LikeService();
