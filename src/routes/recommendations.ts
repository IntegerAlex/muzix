// API Routes for recommendations and blends
import { Hono } from "hono";
import { recommendationEngine } from "../services/recommendation";
import { trackService } from "../services/track";
import { playlistService } from "../services/playlist";

export const recommendationsRouter = new Hono();

/**
 * GET /api/recommendations - Get personalized recommendations for a user
 */
recommendationsRouter.get("/", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const limit = parseInt(c.req.query("limit") || "20");
    const recommendations = recommendationEngine.getRecommendations(userId, limit);

    return c.json({
      success: true,
      data: recommendations,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/recommendations/similar/:trackId - Get similar tracks
 */
recommendationsRouter.get("/similar/:trackId", async (c) => {
  try {
    const trackId = c.req.param("trackId");
    const limit = parseInt(c.req.query("limit") || "10");
    
    const recommendations = recommendationEngine.getSimilarTracks(trackId, limit);

    return c.json({
      success: true,
      data: recommendations,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/recommendations/daily-mix - Get daily mix for a user
 */
recommendationsRouter.get("/daily-mix", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const mixes = recommendationEngine.getDailyMix(userId);

    return c.json({
      success: true,
      data: mixes,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/recommendations/listen - Record listening history
 */
recommendationsRouter.post("/listen", async (c) => {
  try {
    const body = await c.req.json();
    const { userId, trackId, completionPercentage = 0 } = body;

    if (!userId || !trackId) {
      return c.json({ 
        success: false, 
        error: "userId and trackId are required" 
      }, 400);
    }

    recommendationEngine.recordListening(userId, trackId, completionPercentage);

    return c.json({
      success: true,
      message: "Listening history recorded",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/recommendations/preferences - Get user preferences
 */
recommendationsRouter.get("/preferences", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    let preferences = recommendationEngine.getPreferences(userId);
    
    // If no saved preferences, analyze from history
    if (!preferences) {
      preferences = recommendationEngine.analyzePreferences(userId);
    }

    return c.json({
      success: true,
      data: preferences,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/recommendations/preferences - Update user preferences
 */
recommendationsRouter.put("/preferences", async (c) => {
  try {
    const body = await c.req.json();
    const { userId, genres, artists, qualityPreference } = body;

    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    recommendationEngine.updatePreferences(
      userId,
      genres || [],
      artists || [],
      qualityPreference || "high"
    );

    return c.json({
      success: true,
      message: "Preferences updated",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== BLENDS ROUTES ====================

export const blendsRouter = new Hono();

/**
 * POST /api/blends - Create a blend playlist for multiple users
 */
blendsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const { name, userIds, creatorId } = body;

    if (!name || !userIds || !Array.isArray(userIds) || !creatorId) {
      return c.json({ 
        success: false, 
        error: "name, creatorId, and userIds array are required" 
      }, 400);
    }

    // Generate blend recommendations
    const recommendedTracks = recommendationEngine.createBlendRecommendations(userIds, 30);

    // Create the blend playlist
    const { v4: uuidv4 } = await import("uuid");
    const blendId = uuidv4();
    const now = new Date().toISOString();

    const db = require("../db/schema").getDb();
    
    const stmt = db.prepare(`
      INSERT INTO blends (id, name, creator_id, participant_ids, track_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      blendId,
      name,
      creatorId,
      JSON.stringify(userIds),
      JSON.stringify(recommendedTracks.map(t => t.id)),
      now,
      now
    );

    return c.json({
      success: true,
      data: {
        id: blendId,
        name,
        creatorId,
        participants: userIds,
        tracks: recommendedTracks,
      },
      message: "Blend created successfully",
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/blends/:id - Get blend by ID
 */
blendsRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = require("../db/schema").getDb();

    const stmt = db.prepare("SELECT * FROM blends WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) {
      return c.json({ success: false, error: "Blend not found" }, 404);
    }

    const trackIds = JSON.parse(row.track_ids);
    const tracks = trackService.getByIds(trackIds);

    return c.json({
      success: true,
      data: {
        id: row.id,
        name: row.name,
        creatorId: row.creator_id,
        participants: JSON.parse(row.participant_ids),
        tracks,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/blends/user/:userId - Get all blends for a user
 */
blendsRouter.get("/user/:userId", async (c) => {
  try {
    const userId = c.req.param("userId");
    const db = require("../db/schema").getDb();

    const stmt = db.prepare(`
      SELECT * FROM blends
      WHERE participant_ids LIKE ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(`%${userId}%`) as any[];
    
    const blends = rows.map((row) => ({
      id: row.id,
      name: row.name,
      creatorId: row.creator_id,
      participants: JSON.parse(row.participant_ids),
      trackCount: JSON.parse(row.track_ids).length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return c.json({
      success: true,
      data: blends,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/blends/:id/refresh - Refresh blend recommendations
 */
blendsRouter.put("/:id/refresh", async (c) => {
  try {
    const id = c.req.param("id");
    const db = require("../db/schema").getDb();

    const stmt = db.prepare("SELECT * FROM blends WHERE id = ?");
    const row = stmt.get(id) as any;

    if (!row) {
      return c.json({ success: false, error: "Blend not found" }, 404);
    }

    const participantIds = JSON.parse(row.participant_ids);
    const recommendedTracks = recommendationEngine.createBlendRecommendations(participantIds, 30);
    const now = new Date().toISOString();

    const updateStmt = db.prepare(`
      UPDATE blends
      SET track_ids = ?, updated_at = ?
      WHERE id = ?
    `);

    updateStmt.run(JSON.stringify(recommendedTracks.map(t => t.id)), now, id);

    return c.json({
      success: true,
      data: {
        tracks: recommendedTracks,
      },
      message: "Blend refreshed",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * DELETE /api/blends/:id - Delete a blend
 */
blendsRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const db = require("../db/schema").getDb();

    const stmt = db.prepare("DELETE FROM blends WHERE id = ?");
    stmt.run(id);

    return c.json({
      success: true,
      message: "Blend deleted",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
