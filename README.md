# Muzix

Music streaming app with FastAPI backend, PostgreSQL, Cloudflare R2 storage, and Expo (React Native) frontend.

## Architecture

### Backend

```
backend/
├── config.py          # Environment variables, constants, R2 client
├── middleware.py       # CORS + security headers + X-Request-ID (raw ASGI)
├── helpers.py         # Response format, rate limiting, caching, validation, serialization, auth
├── crypto.py          # Password hashing: argon2id (new) + bcrypt (legacy)
├── main.py            # App bootstrap, exception handlers, router includes (local routes gated in prod)
├── db.py              # Async SQLAlchemy engine + session factory
├── models.py          # SQLAlchemy ORM models
├── migrate.py         # Idempotent SQL migration (no Alembic)
├── backfill_genre.py  # Song genre enrichment via MusicBrainz + Wikipedia
├── import_songs.py    # Catalog import: Genius lyrics + YouTube download + MusicBrainz genre
├── repositories/      # Database operations per entity
├── services/          # Business logic per entity
└── routes/            # API endpoints per entity
```

**Layer flow:** `routes/` → `services/` → `repositories/` → `db.py` + `models.py`

### Frontend

```
web/muzix/
├── app/               # Expo Router file-based routes
│   ├── (tabs)/        # Main tab screens (home, search, library, profile)
│   ├── share/         # Public share link resolution
│   ├── _layout.tsx    # Root layout: auth guard, offline banner, queue panel, keyboard shortcuts, Sentry
│   └── login.tsx, register.tsx
├── components/        # Reusable UI components
│   ├── NowPlaying.tsx # Full player view with lyrics sharing
│   ├── MiniPlayer.tsx # Persistent mini player bar
│   ├── QueuePanel.tsx # Queue management modal (reorder, remove, clear)
│   ├── LyricsPanel.tsx, LyricsImageGenerator.tsx
│   ├── ErrorBoundary.tsx # Sentry-wrapped error boundary
│   └── EmptyStates.tsx, Skeleton.tsx
├── hooks/             # Custom hooks
│   ├── useSharing.ts           # Unified content sharing (API + native/web share)
│   ├── useKeyboardShortcuts.ts # Web keyboard controls (Space, arrows, N/P, L, Q, Esc)
│   ├── useHaptics.ts           # Haptic feedback (native only, web no-op)
│   ├── useLyricsSharing.ts     # Lyrics image generation via view-shot
│   └── useConnectivity.ts      # Online/offline detection
├── store/             # Zustand state
│   ├── playerStore.ts # Player, queue, likes state with zustand persist
│   ├── authStore.ts   # Auth token + user state
│   └── storage.ts     # Cross-platform storage adapter (MMKV native / localStorage web)
├── services/
│   ├── api.ts         # API client with retry, timeout, dedup, Sentry error reporting
│   ├── cache.ts       # ETag-based API response cache (in-memory + localStorage)
│   ├── metrics.ts     # Sentry metrics (API latency, queue depth, track plays)
│   ├── playTimeTracker.ts # Persistent play time accumulator with delta-flush
│   ├── offlineQueue.ts    # Offline request queue with retry
│   └── auth.ts        # Auth API helpers
└── lib/               # Colors, spacing, utilities, responsive breakpoints
```

## Features

- **Content sharing:** Generate share links for songs, albums, artists, playlists, lyrics. 30-day token expiry. Web Share API / native share sheet / clipboard fallback.
- **Lyrics sharing:** Select up to 5 lyrics lines, share as image (16:9 PNG) or plain text. Synced scrolling with LRC support.
- **Home screen dashboard:** 2x2 smart grid with current time, live weather (geolocation + wttr.in), mood derived from recently played song genres.
- **Mood detection:** Analyzes genre of your recent plays and displays a mood label + icon (Energetic, Calm, Confident, etc.).
- **Genre enrichment:** Song genre metadata fetched from MusicBrainz + Wikipedia, stored per-track in the database.
- **MMKV storage:** ~30x faster than AsyncStorage on native. Zustand persist + offline queue + play time tracker all use MMKV. Web falls back to localStorage.
- **Audio playback:** Uses `expo-audio` for cross-platform playback; downloads audio to cache via `expo-file-system`. Falls back gracefully when native TrackPlayer module is unavailable.
- **Play time tracking:** Persistent per-song accumulator flushes deltas to `POST /telemetry/duration` every 30s. Survives app backgrounding and restarts.
- **Queue management:** Slide-up panel with reorder (up/down arrows), remove, clear all.
- **Keyboard shortcuts (web):** Space=play/pause, arrows=seek, N/P=next/prev, L=like, Q=queue, Esc=close.
- **Haptic feedback:** Light/medium/success/error on native (no-op on web).
- **Offline banner:** Persistent top banner when disconnected.
- **Pull-to-refresh:** All detail screens (album, artist, playlist, profile).
- **Responsive layout:** Desktop sidebar, tablet split-view, mobile bottom tabs. Orientation-aware.

## Monitoring

- **Sentry:** Error reporting + performance tracing (20% sample in production). `Sentry.wrap()` on root layout, `ErrorBoundary` catches component crashes, API layer reports errors with request IDs.
- **Sentry Metrics:** `api_response_time`, `api_error`, `queue_depth`, `track_play` tracked via `services/metrics.ts`.
- **Logfire:** Request-level tracing with `logfire.instrument_fastapi()`. Trace context stripped by `SecurityMiddleware` to prevent cross-service contamination.
- **X-Request-ID:** Every response includes a UUID. Accepts client-sent IDs for end-to-end correlation. Set as Sentry tag for debugging.
- **Structured errors:** `ApiError` class with `ErrorKind`, `ErrorSeverity`, and `retryable` fields. Auth errors auto-redirect to login.

## Security

- **Password hashing:** argon2id (new registrations) with bcrypt fallback (existing users)
- **JWT signing:** HS384 (SHA-384 HMAC) with 24-hour expiry + 30-day refresh tokens
- **CORS:** Configurable allowed origins via `CORS_ORIGINS` env var
- **Rate limiting:** Per-IP + per-path sliding window; 10 shares/min per user
- **Security headers:** X-Content-Type-Options, X-Frame-Options, HSTS, CSP, Referrer-Policy, Permissions-Policy
- **Input validation:** Pydantic models with email/password complexity rules
- **IDOR protection:** Playlist ownership checks on all mutation endpoints
- **Docs disabled:** `/docs` and `/redoc` return 404
- **Path traversal blocked:** `/thumbnails/{filename}` rejects `/`, `..`, `\`, null bytes
- **Telemetry capped:** `POST /telemetry/events` limited to 50 events per request
- **Dev routes gated:** `/local/*` routes and static file mounts only available when `ENV != production`

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env   # fill in values
uv sync
uv run python migrate.py          # create tables
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd web/muzix
cp .env.example .env.local   # set EXPO_PUBLIC_API_URL
pnpm install
pnpm dev
```

## Environment Variables

### Backend (`backend/.env`)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg) |
| `JWT_SECRET` | Secret key for JWT token signing (min 32 characters) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | Private bucket name (e.g. `muzix-audio`) |
| `R2_PUBLIC_URL` | Optional custom S3 endpoint |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `ENV` | Set to `production` to gate dev-only routes |
| `LOGFIRE_TOKEN` | Pydemon Logfire token for tracing |

### Frontend (`web/muzix/.env.local`)

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_API_URL` | Base URL of the FastAPI backend |

## Database

The migration (`uv run python migrate.py`) creates:

| Table | Description |
|-------|-------------|
| `songs` | Track metadata with genre, full-text search (tsvector) |
| `albums` | Album metadata with FTS |
| `artists` | Artist metadata with FTS |
| `playlists` | User playlists (with M2M `playlist_songs`) |
| `users` | Auth accounts (email + argon2id hash) |
| `refresh_tokens` | JWT refresh tokens with rotation + revocation tracking (`is_revoked BOOLEAN`) |
| `listening_events` | Per-play telemetry |
| `user_sessions` | Session engagement metrics |
| `song_durations` | Persistent per-user listening time accumulator (unique on `user_id` + `song_id`) |
| `user_likes` | User song likes (unique constraint) |
| `shares` | Share links with 30-day expiry, per-content metadata |

## API

All endpoints return standardized JSON:

```json
{
  "status": "success" | "failed" | "exception",
  "data": {},
  "message": "...",
  "meta": { "pagination": { "total": 65, "limit": 100, ... } }
}
```

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/songs` | No | List songs (paginated, brief, includes genre) |
| GET | `/songs/{id}` | No | Get song by ID (full, includes genre) |
| GET | `/albums` | No | List albums |
| GET | `/albums/{id}` | No | Get album by ID |
| GET | `/artists` | No | List artists |
| GET | `/artists/{id}` | No | Get artist by ID |
| GET | `/playlists` | Yes | List user playlists |
| POST | `/playlists` | Yes | Create playlist |
| PUT | `/playlists/{id}` | Yes | Update playlist |
| DELETE | `/playlists/{id}` | Yes | Delete playlist |
| POST | `/playlists/{id}/songs/{songId}` | Yes | Add song to playlist |
| DELETE | `/playlists/{id}/songs/{songId}` | Yes | Remove song from playlist |
| GET | `/likes` | Yes | Get user's liked songs |
| POST | `/likes/{songId}` | Yes | Like a song |
| DELETE | `/likes/{songId}` | Yes | Unlike a song |
| GET | `/search?q=` | No | Full-text search (songs, albums, artists) |
| GET | `/stream/{id}` | No | Get 1-hour presigned R2 URL |
| GET | `/thumbnails/{id}.jpg` | No | Get song/album thumbnail |
| POST | `/auth/register` | No | Create account |
| POST | `/auth/login` | No | Get JWT + refresh token |
| POST | `/auth/refresh` | No | Refresh JWT token |
| GET | `/auth/me` | Yes | Current user profile |
| POST | `/telemetry/events` | Yes | Batch insert listening events (max 50) |
| POST | `/telemetry/duration` | Yes | Record accumulated play time for a song |
| POST | `/telemetry/session/start` | Yes | Start session |
| POST | `/telemetry/session/end` | Yes | End session |
| POST | `/api/share/generate` | Yes | Generate share link (10/min) |
| GET | `/api/share/{token}` | No | Resolve share link (public) |
| GET | `/analytics/user/top-songs` | Yes | User's top songs |
| GET | `/analytics/user/stats` | Yes | User listening stats |
| GET | `/analytics/user/recent-activity` | Yes | Recent listening activity |

## Performance

- **Async everything:** All database and R2 operations are async (boto3 calls wrapped in `asyncio.to_thread`)
- **ETag caching:** List endpoints return `ETag` + `Cache-Control` headers; 304 on `If-None-Match`
- **MMKV storage:** ~30x faster than AsyncStorage on native for key-value operations
- **Rate limiting:** Sliding window per IP + path with automatic stale key cleanup
- **Brief serialization:** List responses omit `lyrics` and `r2_object_key` (~3KB/song savings)
- **Local file caching:** 60s TTL cache for local asset reads
- **FTS indexes:** GIN-indexed tsvector columns on songs, albums, artists
- **Request deduplication:** In-flight Map prevents duplicate concurrent requests to the same endpoint

## Deployment

Backend is deployed to FastAPI Cloud:

```bash
cd backend
uv run fastapi cloud deploy
```
