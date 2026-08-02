# AGENTS.md

Guidance for AI agents (and humans) working on **Muzix** — a music streaming app with a FastAPI backend, Expo/React Native frontend, and a documented algorithm suite.

## Repo map

```
muzix/
├── backend/          # FastAPI + PostgreSQL + Cloudflare R2 + Upstash Redis
├── web/muzix/        # Expo Router + React Native + Tamagui + Zustand
├── algorithms/       # 16 runtime-algorithm deep-dives (docs, not code)
├── design.md         # Design system spec (dark-first, glass-forward)
├── README.md         # Full docs: architecture, API, env, deployment
├── COPYRIGHT.md      # AGPL-3.0 attribution
└── screenshots/      # Product + demo screenshots
```

**Layer flow (backend):** `routes/` → `services/` → `repositories/` → SQLAlchemy async DB.
**Layer flow (frontend):** `app/` (routes) → `components/` → `hooks/` + `store/` (Zustand) + `services/`.

---

## Backend (`backend/`)

Python 3.12, FastAPI 0.140, SQLAlchemy 2 async, asyncpg, Pydantic 2 (must use `ConfigDict`, not legacy `Config`). Package manager: `uv`.

### Layout

| Path | Purpose |
|------|---------|
| `main.py` | App bootstrap, lifespan, middleware, exception handlers, router includes, custom OpenAPI (injects `bearerAuth`) |
| `schemas.py` | **Single source of truth** for all Pydantic request/response models + shared error-response dicts (`UNAUTHORIZED`, `RATE_LIMITED`, `NOT_FOUND`, ...) |
| `helpers.py` | `success_resp`, `pagination_meta`, rate limiters (Redis + in-memory fallback), ETag/Redis catalog cache, `get_current_user` |
| `crypto.py` | Password hashing: argon2id (new) + bcrypt (legacy fallback) |
| `config.py` | Env vars + constants (incl. `REDIS_ENABLED` derived from Upstash creds) |
| `db.py` | Async engine + session factory (`_async_url` converts sync URL → async) |
| `models.py` | ORM models |
| `migrate.py` | Idempotent SQL migrations, **version-gated** via `schema_migrations` table + `MIGRATION_VERSION` const |
| `routes/` | One file per entity (auth, songs, albums, artists, playlists, likes, stream, search, telemetry, analytics, recommendations, home, share, health, thumbnails, local) |
| `services/` | Business logic; `recommendations.py` holds in-memory ALS model + `get_model_status()`; `redis_client.py` is the Upstash client |
| `repositories/` | SQLAlchemy queries, one per entity |
| `import_songs.py`, `backfill_*.py`, `sync.py`, `reencode_r2.py` | Catalog ETL / data scripts (not runtime paths) |

### Response envelope contract

Every endpoint returns the envelope from `helpers.success_resp` / the `ErrorEnvelope` shape:

```json
{ "status": "success"|"failed"|"exception", "data": ..., "message": "...", "meta": { "pagination": {...} } }
```

- Success: `status: "success"`, typed `data` matching `response_model=Envelope[...]`.
- 4xx: `status: "failed"`, `data: []`, `meta: {}`.
- ≥500: `status: "exception"`.
- 304 (ETag not modified): `{"status":"failed","data":[],"message":"Not Modified"}` — matches `main.py`'s exception handler exactly.

### Conventions to follow

- **Never invent new schemas in routes.** Add models to `schemas.py` and import them. All routes must declare `response_model=Envelope[...]`, `summary`, `description`, and `responses={...}` (merge shared dicts like `{**UNAUTHORIZED, **RATE_LIMITED}`).
- **Auth:** protected routes use `get_current_user` from `helpers.py`. Declare `openapi_extra={"security": [{"bearerAuth": []}]}` on protected routes (the `security=` kwarg is NOT accepted by `APIRouter` — do not use it). Public routes with optional auth use `get_current_user_optional`.
- **Rate limiting:** use `await rate_limit_async(request, ...)` (Redis + in-memory fallback) for auth/share; `rate_limit(request, ...)` (in-memory) elsewhere.
- **Caching:** immutable catalog GETs (songs/albums/artists) go through `cached_catalog_response("catalog", key, body, request)` (Redis generation-scoped). User-scoped data (home, likes) stays on the plain ETag path.
- **Error handling:** raise `HTTPException(status_code=..., detail=...)`; the global handler formats it. Don't return raw dicts on error.
- **Don't touch runtime-imported singletons** (`db.engine`, `services.redis_client.redis`) without understanding startup/shutdown in `main.py`'s lifespan.
- `config.py` reads env at import; `db.py` reads `DATABASE_URL` at import. Tests/scripts that import these need `.env` loaded (`load_dotenv`).
- **Logging:** use `logger = logging.getLogger("muzix.<module>")`.
- **Secrets:** `.env`, `creds/`, and token files are gitignored. Never log or commit them.

### Backend commands (from `backend/`)

```bash
uv sync                        # install deps
uv run python -m compileall -q .   # syntax check
uv run python migrate.py       # apply migrations (version-gated; prints "Skipping" when current)
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
uv run python -c "from main import app; print(len(app.openapi()['paths']))"  # validate OpenAPI builds
```

### Startup model (important)

`main.py` lifespan (see `backend/main.py`):

1. `await run_migrate()` — **blocks** (fast on restart thanks to the version gate).
2. ALS training runs as a **background task** (`asyncio.create_task`) time-boxed to `STARTUP_TRAIN_TIMEOUT_S = 20`. The app reaches "startup complete" immediately.
3. On shutdown: cancel + await the training task, then dispose engine + close Redis.

`/health` returns `recommendations: {trained, last_trained_at, ...}` for readiness gating. If you change training, keep the non-blocking + time-boxed behavior.

---

## Frontend (`web/muzix/`)

Expo SDK 57, React 19, Expo Router, Tamagui, Zustand, React Native 0.86. Package manager: **pnpm**.

### Layout

| Path | Purpose |
|------|---------|
| `app/` | Expo Router file-based routes: `(tabs)/` (home, search, library, profile), `share/`, `login.tsx`, `register.tsx`, `_layout.tsx` |
| `components/` | UI: `NowPlaying.tsx`, `MiniPlayer.tsx`, `QueuePanel.tsx`, `LyricsPanel.tsx`, `PlayerBridge.tsx`, etc. |
| `hooks/` | `useSharing`, `useHaptics`, `useConnectivity`, `useLyricsSharing`, `useKeyboardShortcuts` |
| `store/` | Zustand: `playerStore.ts`, `authStore.ts`, `authStorage.ts`, `initPlayer.ts`, `storage.ts` (MMKV native / localStorage web) |
| `services/` | `api.ts` (fetch + retry + dedup), `cache.ts` (ETag), `auth.ts`, `metrics.ts` (Sentry), `offlineQueue.ts`, `playTimeTracker.ts`, `catalogDb.*`, `audioCache.*` (`.native.ts` vs web split) |
| `lib/` | `colors.ts`, `theme.ts`, `config.ts` (`API_URL` from `EXPO_PUBLIC_API_URL`), `utils.ts`, responsive helpers |
| `__tests__/` | Jest tests |

### Conventions

- **Platform split:** files like `catalogDb.native.ts` / `catalogDb.ts` and `playerService.web.ts` use the RN extension resolution. Add platform-specific files with the matching suffix, keep shared logic in the base file.
- **State:** use Zustand with `persist`. `playerStore` owns player + queue + likes; `authStore` owns tokens/user. MMKV on native, localStorage on web (via `store/storage.ts`).
- **Styling:** Tamagui + `lib/colors.ts` tokens. Follow `design.md` (dark-only, glass-forward, accent `#1DB954`). Never introduce a light mode or hardcoded hex that bypasses tokens.
- **API client:** route all HTTP through `services/api.ts` (handles 401 → refresh → retry, dedup, Sentry). Don't add ad-hoc `fetch` calls.
- **TypeScript:** `lint` = `tsc --noEmit`. Keep types in `services/types.ts` or colocated. No `any` where a type exists.
- **Routing:** Expo Router file-based; don't add a navigation library.

### Frontend commands (from `web/muzix/`)

```bash
pnpm install
pnpm dev                 # expo start -c
pnpm lint                # tsc --noEmit
pnpm test                # jest
pnpm test:coverage       # jest --coverage
pnpm android / pnpm ios  # native dev
```

`EXPO_PUBLIC_API_URL` in `.env.local` sets the backend base URL (default `http://localhost:8000`).

---

## Database (`migrate.py`)

Version-gated, idempotent, no Alembic. To change schema:

1. Edit `backend/migrate.py` — always use `IF NOT EXISTS` / idempotent forms.
2. **Bump `MIGRATION_VERSION`** (currently `2`) so the change runs once, then records the new version.
3. Run `uv run python migrate.py` to apply, run again to confirm it prints "Skipping".

Key tables: `users`, `refresh_tokens` (rotation families), `songs`/`albums`/`artists` (with `fts TSVECTOR` + GIN/trgm indexes), `playlists` + `playlist_songs`, `listening_events`, `user_sessions`, `song_durations`, `user_likes`, `shares`, `schema_migrations`.

Note: the full DDL pass takes ~50s against the Neon pooler (network round-trips); the version gate is what keeps restarts ~6s. Preserve the `WHERE fts IS NULL` backfill guard — do not reintroduce full-table `to_tsvector` backfills.

---

## Algorithms (`algorithms/`)

16 markdown docs (`01-recommendation-engine.md` … `16-genre-backfill.md`) documenting runtime logic: ALS recommendation engine, interaction scoring, Fisher-Yates shuffle, player logic, play-time tracking, offline queue, analytics, mood system, caching (LRU + Redis generation-scoped), audio cache, network retry, auth & rate limiting, lyrics/color, search, thumbnails, genre backfill.

- Each doc has a **Type**, **File:line** refs, **How it works**, **Constants**, and **Input → Output**.
- Line refs go stale — if a referenced function moved, grep for the function name.
- If you change a documented algorithm, **update the matching doc + the index in `algorithms/README.md`** (including the "Last audited" date).
- The index table also drives the README's "Algorithms" summary.

---

## Docs

- `README.md` is the primary user-facing doc. Keep the API table, env-var tables, and architecture trees in sync with code.
- `design.md` is the UI spec — changes to `lib/colors.ts`/`lib/theme.ts` should be reflected there.
- When editing `README.md`: keep code fences balanced (close every ` ``` `), and preserve the footer attribution.
- `COPYRIGHT.md` holds license/attribution; license is AGPL-3.0.

---

## Deployment

- **Backend:** FastAPI Cloud. From `backend/`: `uv run fastapi cloud deploy`. Live: `https://fast-api-cloud-demo.fastapicloud.dev`. The `.fastapicloud/` dir is gitignored (contains `app_id`/`team_id`).
- **Frontend:** EAS Build (see `web/muzix/eas.json`) for native; `expo export` for web.
- Env vars (backend `.env`): `DATABASE_URL`, `JWT_SECRET`, `R2_*`, `CORS_ORIGINS`, `LOGFIRE_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `ENV=production` (gates `/local/*` + static mounts).
- Health check: `/health` must return 200 — it now does so immediately even while training runs in the background.

---

## Testing & verification checklist

1. Backend: `uv run python -m compileall -q .` then `uv run python -c "from main import app"` (imports must not error).
2. `uv run uvicorn main:app --port 8000` → wait for "Application startup complete" (should be ~8s, not hang).
3. `curl localhost:8000/health` → 200, `status: success`; `/docs` → 200; `/openapi.json` → 200 with no broken `$ref`.
4. Frontend: `pnpm lint` (tsc) and `pnpm test` pass before committing UI changes.
5. Before committing, re-run the above and review `git diff` for secrets or `.env`/`creds` leakage.

## Commit conventions

- Commit messages follow the existing style: `type(scope): summary` (e.g. `fix(backend):`, `feat(web):`, `docs(algorithms):`, `feat(backend):`).
- Commit only explicitly requested changes; don't commit generated artifacts (`analysis.json`, `dist/`, `node_modules/`, `__pycache__/`).
