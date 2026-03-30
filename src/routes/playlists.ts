// API Routes for playlists and likes
import { Hono } from "hono";
import { playlistService, likeService } from "../services/playlist";
import { recommendationEngine } from "../services/recommendation";

export const playlistsRouter = new Hono();

/**
 * GET /api/playlists - Get user's playlists
 */
playlistsRouter.get("/", async (c) => {
  try {
    // In production, get userId from authenticated session
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const includeTracks = c.req.query("includeTracks") === "true";
    const playlists = playlistService.getByUser(userId, includeTracks);

    return c.json({
      success: true,
      data: playlists,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/playlists/public - Get public playlists
 */
playlistsRouter.get("/public", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "50");
    const playlists = playlistService.getPublic(limit);

    return c.json({
      success: true,
      data: playlists,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/playlists/:id - Get playlist by ID
 */
playlistsRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const playlist = playlistService.getByIdWithTracks(id);

    return c.json({
      success: true,
      data: playlist,
    });
  } catch (error: any) {
    if (error.message === "Playlist not found") {
      return c.json({ success: false, error: error.message }, 404);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/playlists - Create a new playlist
 */
playlistsRouter.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const userId = body.userId;

    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const playlist = playlistService.create({
      userId,
      name: body.name,
      description: body.description,
      isPublic: body.isPublic ?? false,
    });

    return c.json({
      success: true,
      data: playlist,
      message: "Playlist created successfully",
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/playlists/:id - Update playlist
 */
playlistsRouter.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const playlist = playlistService.update(id, {
      name: body.name,
      description: body.description,
      isPublic: body.isPublic,
    });

    return c.json({
      success: true,
      data: playlist,
    });
  } catch (error: any) {
    if (error.message === "Playlist not found") {
      return c.json({ success: false, error: error.message }, 404);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * DELETE /api/playlists/:id - Delete playlist
 */
playlistsRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    playlistService.delete(id);

    return c.json({
      success: true,
      message: "Playlist deleted successfully",
    });
  } catch (error: any) {
    if (error.message === "Playlist not found") {
      return c.json({ success: false, error: error.message }, 404);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/playlists/:id/tracks - Add track to playlist
 */
playlistsRouter.post("/:id/tracks", async (c) => {
  try {
    const playlistId = c.req.param("id");
    const body = await c.req.json();
    const trackId = body.trackId;

    if (!trackId) {
      return c.json({ success: false, error: "trackId is required" }, 400);
    }

    playlistService.addTrack({ playlistId, trackId });

    return c.json({
      success: true,
      message: "Track added to playlist",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * DELETE /api/playlists/:id/tracks/:trackId - Remove track from playlist
 */
playlistsRouter.delete("/:id/tracks/:trackId", async (c) => {
  try {
    const playlistId = c.req.param("id");
    const trackId = c.req.param("trackId");

    playlistService.removeTrack(playlistId, trackId);

    return c.json({
      success: true,
      message: "Track removed from playlist",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/playlists/:id/reorder - Reorder tracks in playlist
 */
playlistsRouter.put("/:id/reorder", async (c) => {
  try {
    const playlistId = c.req.param("id");
    const body = await c.req.json();
    const trackIds = body.trackIds;

    if (!Array.isArray(trackIds)) {
      return c.json({ success: false, error: "trackIds array is required" }, 400);
    }

    playlistService.reorderTracks(playlistId, trackIds);

    return c.json({
      success: true,
      message: "Playlist reordered",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

// ==================== LIKES ROUTES ====================

export const likesRouter = new Hono();

/**
 * GET /api/likes - Get user's liked tracks
 */
likesRouter.get("/", async (c) => {
  try {
    const userId = c.req.query("userId");
    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const tracks = likeService.getUserLikes(userId);

    return c.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/likes/:trackId/check - Check if user liked a track
 */
likesRouter.get("/:trackId/check", async (c) => {
  try {
    const trackId = c.req.param("trackId");
    const userId = c.req.query("userId");

    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const isLiked = likeService.isLiked(userId, trackId);
    const count = likeService.getLikeCount(trackId);

    return c.json({
      success: true,
      data: { isLiked, count },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/likes/:trackId - Like a track
 */
likesRouter.post("/:trackId", async (c) => {
  try {
    const trackId = c.req.param("trackId");
    const body = await c.req.json();
    const userId = body.userId;

    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    const like = likeService.like(userId, trackId);

    return c.json({
      success: true,
      data: like,
      message: "Track liked",
    }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * DELETE /api/likes/:trackId - Unlike a track
 */
likesRouter.delete("/:trackId", async (c) => {
  try {
    const trackId = c.req.param("trackId");
    const userId = c.req.query("userId");

    if (!userId) {
      return c.json({ success: false, error: "userId is required" }, 400);
    }

    likeService.unlike(userId, trackId);

    return c.json({
      success: true,
      message: "Track unliked",
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/likes/:trackId/count - Get like count for a track
 */
likesRouter.get("/:trackId/count", async (c) => {
  try {
    const trackId = c.req.param("trackId");
    const count = likeService.getLikeCount(trackId);

    return c.json({
      success: true,
      data: { count },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
