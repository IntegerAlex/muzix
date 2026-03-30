// Main application entry point
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { compress } from "hono/compress";

// Import routers
import { tracksRouter } from "./routes/tracks";
import { playlistsRouter, likesRouter } from "./routes/playlists";
import { recommendationsRouter, blendsRouter } from "./routes/recommendations";

// Initialize database
import { getDb } from "./db/schema";

const app = new Hono();

// ==================== MIDDLEWARE ====================

// Compression for responses
app.use("*", compress());

// CORS
app.use(
  "*",
  cors({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Range"],
    exposeHeaders: ["Content-Range", "Accept-Ranges"],
    credentials: true,
    maxAge: 86400,
  })
);

// Logger
app.use("*", logger());

// Pretty JSON for development
if (process.env.NODE_ENV !== "production") {
  app.use("*", prettyJSON());
}

// ==================== HEALTH CHECK ====================

app.get("/", (c) => {
  return c.json({
    name: "Music Streaming API",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (c) => {
  try {
    // Test database connection
    const db = getDb();
    db.prepare("SELECT 1").get();

    return c.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

// ==================== API ROUTES ====================

// Mount routers
app.route("/api/tracks", tracksRouter);
app.route("/api/playlists", playlistsRouter);
app.route("/api/likes", likesRouter);
app.route("/api/recommendations", recommendationsRouter);
app.route("/api/blends", blendsRouter);

// ==================== ERROR HANDLING ====================

app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: "Not Found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

app.onError((err, c) => {
  console.error("Error:", err);

  return c.json(
    {
      success: false,
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred",
    },
    500
  );
});

// ==================== SERVER STARTUP ====================

const port = parseInt(process.env.PORT || "3000");
const host = process.env.HOST || "0.0.0.0";

console.log(`🎵 Music Streaming API starting on http://${host}:${port}`);

export default {
  port,
  hostname: host,
  fetch: app.fetch,
};
