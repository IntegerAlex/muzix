// Recommendation engine service
import { getDb, type Track } from "../db/schema";
import { trackService } from "./track";

export interface UserListeningHistory {
  userId: string;
  trackId: string;
  playedAt: string;
  completionPercentage: number;
}

export interface UserPreferences {
  userId: string;
  preferredGenres: string[];
  preferredArtists: string[];
  audioQualityPreference: string;
}

export interface Recommendation {
  track: Track;
  score: number;
  reason: string;
}

export class RecommendationEngine {
  /**
   * Record listening history
   */
  recordListening(
    userId: string,
    trackId: string,
    completionPercentage: number = 0
  ): void {
    const db = getDb();
    const { v4: uuidv4 } = require("uuid");
    const id = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO listening_history (id, user_id, track_id, completion_percentage)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, userId, trackId, completionPercentage);
  }

  /**
   * Get user's listening history
   */
  getListeningHistory(userId: string, limit: number = 100): UserListeningHistory[] {
    const db = getDb();
    const stmt = db.prepare(`
      SELECT * FROM listening_history
      WHERE user_id = ?
      ORDER BY played_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(userId, limit) as any[];
    return rows.map((row) => ({
      userId: row.user_id,
      trackId: row.track_id,
      playedAt: row.played_at,
      completionPercentage: row.completion_percentage,
    }));
  }

  /**
   * Update or create user preferences
   */
  updatePreferences(
    userId: string,
    genres: string[],
    artists: string[],
    qualityPreference: string = "high"
  ): void {
    const db = getDb();

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_preferences 
      (user_id, preferred_genres, preferred_artists, audio_quality_preference)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      userId,
      JSON.stringify(genres),
      JSON.stringify(artists),
      qualityPreference
    );
  }

  /**
   * Get user preferences
   */
  getPreferences(userId: string): UserPreferences | null {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM user_preferences WHERE user_id = ?");
    const row = stmt.get(userId) as any;

    if (!row) {
      return null;
    }

    return {
      userId: row.user_id,
      preferredGenres: row.preferred_genres ? JSON.parse(row.preferred_genres) : [],
      preferredArtists: row.preferred_artists ? JSON.parse(row.preferred_artists) : [],
      audioQualityPreference: row.audio_quality_preference || "high",
    };
  }

  /**
   * Analyze user preferences from listening history
   */
  analyzePreferences(userId: string): UserPreferences {
    const db = getDb();
    const history = this.getListeningHistory(userId, 500);

    // Get all listened track IDs
    const trackIds = [...new Set(history.map((h) => h.trackId))];
    if (trackIds.length === 0) {
      return {
        userId,
        preferredGenres: [],
        preferredArtists: [],
        audioQualityPreference: "high",
      };
    }

    // Get track details
    const tracks = trackService.getByIds(trackIds);

    // Count genre and artist frequencies
    const genreCount: Record<string, number> = {};
    const artistCount: Record<string, number> = {};

    tracks.forEach((track) => {
      genreCount[track.genre] = (genreCount[track.genre] || 0) + 1;
      artistCount[track.artist] = (artistCount[track.artist] || 0) + 1;
    });

    // Sort by frequency and take top 5
    const topGenres = Object.entries(genreCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([genre]) => genre);

    const topArtists = Object.entries(artistCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([artist]) => artist);

    return {
      userId,
      preferredGenres: topGenres,
      preferredArtists: topArtists,
      audioQualityPreference: "high",
    };
  }

  /**
   * Get personalized recommendations for a user
   */
  getRecommendations(userId: string, limit: number = 20): Recommendation[] {
    const preferences = this.getPreferences(userId) || this.analyzePreferences(userId);
    const recommendations: Recommendation[] = [];
    const seenTrackIds = new Set<string>();

    // Get user's listening history to exclude already heard tracks
    const history = this.getListeningHistory(userId, 100);
    history.forEach((h) => seenTrackIds.add(h.trackId));

    // Strategy 1: Recommend by preferred genres
    if (preferences.preferredGenres.length > 0) {
      for (const genre of preferences.preferredGenres) {
        const tracks = trackService.getByGenre(genre, 10);
        tracks.forEach((track) => {
          if (!seenTrackIds.has(track.id) && recommendations.length < limit) {
            recommendations.push({
              track,
              score: 0.8,
              reason: `Based on your interest in ${genre}`,
            });
            seenTrackIds.add(track.id);
          }
        });
      }
    }

    // Strategy 2: Recommend by preferred artists
    if (preferences.preferredArtists.length > 0) {
      for (const artist of preferences.preferredArtists) {
        const tracks = trackService.getByArtist(artist, 5);
        tracks.forEach((track) => {
          if (!seenTrackIds.has(track.id) && recommendations.length < limit) {
            recommendations.push({
              track,
              score: 0.9,
              reason: `More from ${artist}`,
            });
            seenTrackIds.add(track.id);
          }
        });
      }
    }

    // Strategy 3: Recommend popular tracks in liked genres
    if (recommendations.length < limit) {
      const popularTracks = trackService.getPopular(limit * 2);
      popularTracks.forEach((track) => {
        if (
          !seenTrackIds.has(track.id) &&
          preferences.preferredGenres.includes(track.genre) &&
          recommendations.length < limit
        ) {
          recommendations.push({
            track,
            score: 0.7,
            reason: `Trending in ${track.genre}`,
          });
          seenTrackIds.add(track.id);
        }
      });
    }

    // Strategy 4: Fill with recent popular tracks
    if (recommendations.length < limit) {
      const recentTracks = trackService.getRecent(limit);
      recentTracks.forEach((track) => {
        if (!seenTrackIds.has(track.id) && recommendations.length < limit) {
          recommendations.push({
            track,
            score: 0.5,
            reason: "New and trending",
          });
          seenTrackIds.add(track.id);
        }
      });
    }

    // Sort by score
    return recommendations.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Get similar tracks based on audio features and metadata
   */
  getSimilarTracks(trackId: string, limit: number = 10): Recommendation[] {
    const sourceTrack = trackService.getById(trackId);
    const recommendations: Recommendation[] = [];

    // Find tracks with same artist
    const artistTracks = trackService.getByArtist(sourceTrack.artist, limit);
    artistTracks.forEach((track) => {
      if (track.id !== trackId) {
        recommendations.push({
          track,
          score: 0.9,
          reason: `Same artist: ${sourceTrack.artist}`,
        });
      }
    });

    // Find tracks with same genre
    if (recommendations.length < limit) {
      const genreTracks = trackService.getByGenre(sourceTrack.genre, limit);
      genreTracks.forEach((track) => {
        if (
          track.id !== trackId &&
          !recommendations.some((r) => r.track.id === track.id)
        ) {
          recommendations.push({
            track,
            score: 0.7,
            reason: `Similar genre: ${sourceTrack.genre}`,
          });
        }
      });
    }

    // Find tracks from same era (year +/- 2)
    if (recommendations.length < limit) {
      const db = getDb();
      const yearMin = sourceTrack.year - 2;
      const yearMax = sourceTrack.year + 2;

      const stmt = db.prepare(`
        SELECT * FROM tracks
        WHERE year BETWEEN ? AND ?
          AND genre = ?
          AND id != ?
        ORDER BY play_count DESC
        LIMIT ?
      `);

      const rows = stmt.all(yearMin, yearMax, sourceTrack.genre, trackId, limit) as any[];
      rows.forEach((row) => {
        const track = this.mapRowToTrack(row);
        if (!recommendations.some((r) => r.track.id === track.id)) {
          recommendations.push({
            track,
            score: 0.6,
            reason: `From the same era (${sourceTrack.year})`,
          });
        }
      });
    }

    return recommendations.slice(0, limit);
  }

  /**
   * Create a blend playlist for multiple users
   */
  createBlendRecommendations(userIds: string[], limit: number = 30): Track[] {
    if (userIds.length === 0) {
      return [];
    }

    // Get preferences for all users
    const allPreferences = userIds.map((id) => this.analyzePreferences(id));
    const allGenres = new Set<string>();
    const allArtists = new Set<string>();

    allPreferences.forEach((pref) => {
      pref.preferredGenres.forEach((g) => allGenres.add(g));
      pref.preferredArtists.forEach((a) => allArtists.add(a));
    });

    const recommendedTracks: Map<string, Track> = new Map();
    const seenIds = new Set<string>();

    // Get tracks from common genres
    Array.from(allGenres).forEach((genre) => {
      const tracks = trackService.getByGenre(genre, 10);
      tracks.forEach((track) => {
        if (!seenIds.has(track.id) && recommendedTracks.size < limit) {
          recommendedTracks.set(track.id, track);
          seenIds.add(track.id);
        }
      });
    });

    // Get tracks from favorite artists
    Array.from(allArtists).forEach((artist) => {
      const tracks = trackService.getByArtist(artist, 5);
      tracks.forEach((track) => {
        if (!seenIds.has(track.id) && recommendedTracks.size < limit) {
          recommendedTracks.set(track.id, track);
          seenIds.add(track.id);
        }
      });
    });

    // Fill with popular tracks if needed
    if (recommendedTracks.size < limit) {
      const popularTracks = trackService.getPopular(limit);
      popularTracks.forEach((track) => {
        if (!seenIds.has(track.id) && recommendedTracks.size < limit) {
          recommendedTracks.set(track.id, track);
          seenIds.add(track.id);
        }
      });
    }

    return Array.from(recommendedTracks.values());
  }

  /**
   * Get daily mix based on listening patterns
   */
  getDailyMix(userId: string): { name: string; tracks: Track[] }[] {
    const preferences = this.analyzePreferences(userId);
    const mixes: { name: string; tracks: Track[] }[] = [];

    // Create mixes for top genres
    preferences.preferredGenres.slice(0, 3).forEach((genre) => {
      const tracks = trackService.getByGenre(genre, 25);
      if (tracks.length > 0) {
        mixes.push({
          name: `${genre} Mix`,
          tracks: this.shuffleArray(tracks).slice(0, 20),
        });
      }
    });

    // Create artist discovery mix
    if (preferences.preferredArtists.length > 0) {
      const topArtist = preferences.preferredArtists[0]!;
      const tracks = trackService.getByArtist(topArtist, 10);
      
      // Add similar artists' tracks
      const db = getDb();
      const placeholders = preferences.preferredGenres.map(() => "?").join(",");
      const stmt = db.prepare(`
        SELECT * FROM tracks
        WHERE genre IN (${placeholders})
          AND artist != ?
        ORDER BY play_count DESC
        LIMIT 15
      `);
      
      const similarTracks = stmt.all(...preferences.preferredGenres, topArtist) as any[];
      const similar = similarTracks.map((row) => this.mapRowToTrack(row));
      
      mixes.push({
        name: "Discover Weekly",
        tracks: [...tracks, ...similar].slice(0, 20),
      });
    }

    // Create chill/recent mix
    const recentTracks = trackService.getRecent(20);
    mixes.push({
      name: "New Releases",
      tracks: recentTracks,
    });

    return mixes;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
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

export const recommendationEngine = new RecommendationEngine();
