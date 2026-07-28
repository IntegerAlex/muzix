# Muzix — MVP

End-to-end pipeline: local MP3 → R2 (private) + PostgreSQL metadata → FastAPI search/presign → Expo Liquid-Glass player with local caching.

## Architecture

- **Backend**: FastAPI (Python) with async SQLAlchemy + asyncpg
- **Database**: PostgreSQL (Neon) — songs, albums, artists, playlists, users, telemetry
- **Storage**: Cloudflare R2 (private bucket) for audio files
- **Auth**: JWT-based (bcrypt password hashing)
- **Frontend**: Expo (React Native) with local caching

## Quick Start

### 1. Backend

```bash
cd backend
cp .env.example .env   # fill in values
uv sync
uv run python migrate.py          # create tables
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

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
| `JWT_SECRET` | Secret key for JWT token signing |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | Private bucket name (e.g. `muzix-audio`) |
| `R2_PUBLIC_URL` | Optional custom S3 endpoint |
| `CORS_ORIGINS` | Comma-separated frontend origins |

### Frontend (`web/muzix/.env.local`)

| Var | Purpose |
|-----|---------|
| `EXPO_PUBLIC_API_URL` | Base URL of the FastAPI backend. On Android emulator use `http://10.0.2.2:8000`; on a physical device use your LAN IP. |

## Database Tables

The migration (`uv run python migrate.py`) creates:

- **songs** — track metadata with full-text search (tsvector)
- **albums** — album metadata with FTS
- **artists** — artist metadata
- **playlists** — user playlists (with M2M `playlist_songs`)
- **users** — auth accounts (email + bcrypt hash)
- **listening_events** — per-play telemetry
- **user_sessions** — session engagement metrics

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/songs` | List songs (paginated) |
| GET | `/songs/{id}` | Get song by ID |
| GET | `/albums` | List albums |
| GET | `/albums/{id}` | Get album by ID |
| GET | `/artists` | List artists |
| GET | `/artists/{id}` | Get artist by ID |
| GET | `/playlists` | List playlists |
| GET | `/search?q=` | Full-text search across songs, albums, artists |
| GET | `/stream/{id}` | Get 1-hour presigned R2 URL |
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Get JWT token |
| GET | `/auth/me` | Current user (requires Bearer token) |
| POST | `/telemetry/events` | Batch insert listening events |
| POST | `/telemetry/session/start` | Start session |
| POST | `/telemetry/session/end` | End session |
| GET | `/analytics/user/top-songs` | User's top songs |
| GET | `/analytics/user/stats` | User listening stats |

## Notes

- `app.json` already grants Android `INTERNET`/`WAKE_LOCK`/foreground-service permissions and registers `expo-av`.
- For background audio on Android you still need `Audio.setAudioModeAsync({ staysActiveInBackground: true })` — add later when wiring a global player.
