// API Routes for tracks
import { Hono } from "hono";
import { trackService } from "../services/track";
import { streamAudio } from "../services/storage";
import { recommendationEngine } from "../services/recommendation";

export const tracksRouter = new Hono();

/**
 * GET /api/tracks - Get all tracks (paginated)
 */
tracksRouter.get("/", async (c) => {
  try {
    const page = parseInt(c.req.query("page") || "1");
    const limit = parseInt(c.req.query("limit") || "50");

    const result = trackService.getAll(page, limit);

    return c.json({
      success: true,
      data: result.tracks,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/search - Search tracks
 */
tracksRouter.get("/search", async (c) => {
  try {
    const query = c.req.query("q");
    if (!query) {
      return c.json({ success: false, error: "Query parameter 'q' is required" }, 400);
    }

    const limit = parseInt(c.req.query("limit") || "50");
    const tracks = trackService.searchSimple(query, limit);

    return c.json({
      success: true,
      data: tracks,
      query,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/popular - Get popular tracks
 */
tracksRouter.get("/popular", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "20");
    const tracks = trackService.getPopular(limit);

    return c.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/recent - Get recent tracks
 */
tracksRouter.get("/recent", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "20");
    const tracks = trackService.getRecent(limit);

    return c.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/:id - Get track by ID
 */
tracksRouter.get("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const track = trackService.getById(id);

    return c.json({
      success: true,
      data: track,
    });
  } catch (error: any) {
    if (error.message === "Track not found") {
      return c.json({ success: false, error: error.message }, 404);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/:id/similar - Get similar tracks
 */
tracksRouter.get("/:id/similar", async (c) => {
  try {
    const id = c.req.param("id");
    const limit = parseInt(c.req.query("limit") || "10");
    
    const recommendations = recommendationEngine.getSimilarTracks(id, limit);

    return c.json({
      success: true,
      data: recommendations,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/:id/stream - Stream track audio with range support
 */
tracksRouter.get("/:id/stream", async (c) => {
  try {
    const id = c.req.param("id");
    const track = trackService.getById(id);
    const rangeHeader = c.req.header("Range");

    // Increment play count
    trackService.incrementPlayCount(id);

    // Record listening history (if user is authenticated - placeholder)
    // const userId = c.get("userId");
    // if (userId) {
    //   recommendationEngine.recordListening(userId, id);
    // }

    const streamResult = await streamAudio(track.compressedPath, rangeHeader);

    if (streamResult.status === 404) {
      return c.json({ success: false, error: "Audio file not found" }, 404);
    }

    if (streamResult.status === 416) {
      return c.json({ success: false, error: "Invalid range" }, 416);
    }

    const headers = new Headers();
    Object.entries(streamResult.headers).forEach(([key, value]) => {
      headers.set(key, value);
    });

    return new Response(streamResult.body, {
      status: streamResult.status,
      headers,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * POST /api/tracks - Create a new track with metadata
 * Accepts multipart form data with audio file and optional metadata
 */
tracksRouter.post("/", async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file as File | undefined;
    const artworkFile = body.artwork as File | undefined;

    if (!file) {
      return c.json({ success: false, error: "Audio file is required" }, 400);
    }

    // Convert Web File to BunFile by reading the content
    const arrayBuffer = await file.arrayBuffer();
    
    // Create a simple BunFile with just the data and a proper filename
    const originalName = file.name || "upload.wav";
    const cleanName = originalName.replace(/[^a-zA-Z0-9.-]/g, "_").substring(0, 50);
    
    // Write directly to a temp location and create BunFile from path
    const tempPath = `/tmp/upload_${trackId || Date.now()}_${cleanName}`;
    await Bun.write(tempPath, new Uint8Array(arrayBuffer));
    const bunFile = Bun.file(tempPath);

    let artworkBunFile: typeof bunFile | undefined;
    if (artworkFile) {
      const artworkBuffer = await artworkFile.arrayBuffer();
      const artworkName = artworkFile.name || "artwork.jpg";
      const cleanArtworkName = artworkName.replace(/[^a-zA-Z0-9.-]/g, "_").substring(0, 50);
      const artworkTempPath = `/tmp/artwork_${Date.now()}_${cleanArtworkName}`;
      await Bun.write(artworkTempPath, new Uint8Array(artworkBuffer));
      artworkBunFile = Bun.file(artworkTempPath);
    }

    const track = await trackService.create({
      title: (body.title as string) || file.name || "Untitled",
      artist: (body.artist as string) || "Unknown Artist",
      album: body.album as string,
      genre: body.genre as string,
      year: body.year ? parseInt(body.year as string) : undefined,
      file: bunFile,
      artworkFile: artworkBunFile,
    });

    return c.json({
      success: true,
      data: track,
      message: "Track uploaded successfully with metadata",
    }, 201);
  } catch (error: any) {
    console.error("Upload error:", error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * PUT /api/tracks/:id - Update track metadata
 */
tracksRouter.put("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();

    const track = trackService.update(id, {
      title: body.title,
      artist: body.artist,
      album: body.album,
      genre: body.genre,
      year: body.year,
    });

    return c.json({
      success: true,
      data: track,
    });
  } catch (error: any) {
    if (error.message === "Track not found") {
      return c.json({ success: false, error: error.message }, 404);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * DELETE /api/tracks/:id - Delete a track
 */
tracksRouter.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    trackService.delete(id);

    return c.json({
      success: true,
      message: "Track deleted successfully",
    });
  } catch (error: any) {
    if (error.message === "Track not found") {
      return c.json({ success: false, error: error.message }, 404);
    }
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/artist/:name - Get tracks by artist
 */
tracksRouter.get("/artist/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const limit = parseInt(c.req.query("limit") || "50");
    const tracks = trackService.getByArtist(decodeURIComponent(name), limit);

    return c.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});

/**
 * GET /api/tracks/genre/:name - Get tracks by genre
 */
tracksRouter.get("/genre/:name", async (c) => {
  try {
    const name = c.req.param("name");
    const limit = parseInt(c.req.query("limit") || "50");
    const tracks = trackService.getByGenre(decodeURIComponent(name), limit);

    return c.json({
      success: true,
      data: tracks,
    });
  } catch (error: any) {
    return c.json({ success: false, error: error.message }, 500);
  }
});
