# Muzix Release Notes

## v1.1.0 — 2026-10-10

Play anything, and everything you play counts.

### New features

- **Search all of YouTube** — the Search tab has a new on-device section. Any track found there plays directly: the app extracts AAC audio on the phone (Android), caches it, and plays it like any other song. No server involved.
- **Autoplay** — when the queue runs out, the app pulls up to 25 similar tracks from the seed song's YouTube Mix (with a metadata-search fallback) and keeps playing. Toggle in the queue panel; the preference persists across restarts.
- **YouTube plays count** — telemetry events now carry full song metadata, and the backend auto-registers unknown tracks on first play/like. On-device tracks show up in recent activity, top songs, stats, mood, and recommendations instead of vanishing at a foreign key.
- **Mood v2** — genre vote (~45 genres, up from 25) blended 70/30 with time-of-day energy, plus energy/valence/confidence scores. Genre-less YouTube tracks fall back to time-of-day instead of Neutral. The home card shows an energy bar.
- **Haptics everywhere** — light impact on all MiniPlayer/NowPlaying transport controls, seeks, queue rows, and likes (previously like-only).
- **Source badges** — YouTube tracks show a `YT`/`YOUTUBE` pill in rows and Now Playing.

### Fixes

- **R2 silent data loss** — `import_songs.py` verifies each upload with `head_object` (+ size check) before writing the DB row. Failed uploads are skipped instead of producing phantom catalog entries.
- **MMKV v4** — storage used the removed `new MMKV()` constructor, so *everything* (auth, likes, queue, stats) silently fell back to in-memory and vanished on restart. Now uses `createMMKV()` with a v3 fallback.
- **expo-file-system v57** — the main entry's file APIs are throwing stubs; all 8 call sites moved to `expo-file-system/legacy`. (This was also silently breaking offline downloads, which fell back to streaming.)
- **Extension preservation** — extracted audio keeps its real container extension instead of being forced to `.m4a`, which made Opus/WebM streams unplayable.
- **Sentry noise** — expected `/stream/{id}` 404s (catalog probe before on-device fallback) no longer report as errors.
- **Fatal errors skip retries** — bot checks, age gates, and removed videos surface immediately instead of burning 3 retries.

### Technical notes

- New modules: `services/audioSource.ts` (cache → catalog → device resolver), `services/autoQueue.ts` (Mix + search fallback), `registerCachedFile()` cache integration.
- `POST /likes/{songId}` accepts an optional song-metadata body; `POST /telemetry/events` accepts per-event metadata.
- `MoodOut` gains optional `energy`, `valence`, `confidence`, `based_on` (backward compatible).
- Backend version 0.1.0 → 0.2.0. No database migration required (no schema change).

### Upgrade notes

- **Requires a fresh native build** — run `npx expo prebuild --clean`, then build. Does **not** work in Expo Go (needs a dev client).
- `expo-yt-dlp` adds ~11 MB to the APK and drops 32-bit ARM (`armeabi-v7a`); builds target `arm64-v8a` + `x86_64`.
- On-device extraction needs network on first use (runtime unpack) and will fail on some videos (bot checks, age gates, removed content) — those surface as player errors by design.
- Extraction breaks every few weeks when YouTube changes things; keep `expo-yt-dlp` updated.

---

## v1.0.0 — initial release

Catalog streaming from R2, ALS recommendations, lyrics + sharing, telemetry/analytics suite, offline queue, lock-screen controls, dark glass UI.
