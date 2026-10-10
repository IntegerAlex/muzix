import { Platform } from 'react-native';
import { api } from '@/services/api';
import { getCachedAudioPath, downloadToCache, registerCachedFile } from '@/services/audioCache';
import type { Song } from '@/services/types';

const IS_WEB = Platform.OS === 'web';

export type AudioResolution = {
  uri: string;
  /** How the audio was obtained — useful for telemetry/UI hints. */
  source: 'cache' | 'catalog' | 'device' | 'remote';
};

/**
 * expo-yt-dlp is Android-only and needs a dev build. Load it lazily so the
 * module (and its ~11MB runtime) is never touched on web/iOS or in Expo Go.
 */
let _ytdlp: typeof import('expo-yt-dlp') | null = null;
let _ytdlpLoaded = false;

async function getYtDlp(): Promise<typeof import('expo-yt-dlp') | null> {
  if (_ytdlpLoaded) return _ytdlp;
  _ytdlpLoaded = true;
  if (IS_WEB) return null;
  try {
    const mod = await import('expo-yt-dlp');
    if (typeof mod?.isSupported === 'function' && !mod.isSupported()) return null;
    _ytdlp = mod;
    return mod;
  } catch {
    return null;
  }
}

/** True when on-device YouTube extraction is usable on this install. */
export async function canExtractOnDevice(): Promise<boolean> {
  return (await getYtDlp()) != null;
}

/**
 * Unpack the bundled Python/yt-dlp/QuickJS runtime ahead of time. Without this
 * the first extraction pays a one-off unpack cost (a few seconds) on top of the
 * extraction itself. Safe to call repeatedly and to let fail silently.
 */
export async function prepareExtractor(): Promise<void> {
  try {
    const ytdlp = await getYtDlp();
    if (ytdlp) await ytdlp.prepare();
  } catch {}
}

function youtubeUrl(songId: string): string {
  return `https://www.youtube.com/watch?v=${songId}`;
}

/** Same directory audioCache.native.ts writes to. */
function audioCacheDir(): string {
  const FileSystem = require('expo-file-system/legacy');
  const base = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!base) throw new Error('No writable directory available');
  return `${base}muzix-audio/`;
}

/**
 * Move/extract the file yt-dlp wrote (named "<title> [<id>].m4a") into the
 * canonical cache path for this song. Best-effort: if the move fails we still
 * return the original path, which is playable.
 */
async function normalizeToCachePath(src: string, dest: string): Promise<string> {
  try {
    const FileSystem = require('expo-file-system/legacy');
    const dir = dest.slice(0, dest.lastIndexOf('/') + 1);
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const srcPath = src.replace(/^file:\/\//, '');
    const destPath = dest.replace(/^file:\/\//, '');
    if (srcPath === destPath) return dest;
    await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
    await FileSystem.moveAsync({ from: srcPath, to: destPath });
    return dest;
  } catch {
    return src;
  }
}

/**
 * Resolve a playable URI for a song, cheapest source first.
 *
 *  1. cache   — already downloaded to the device
 *  2. catalog — the song exists in our Postgres catalog, stream from R2
 *  3. device  — not in the catalog: extract audio on-device (Android only)
 *
 * Rejects if none work. Note that extraction failures (bot check, age gate,
 * removed video) are not retryable by us — surface them to the user.
 */
export async function resolveAudio(
  songId: string,
  _song?: Song | null,
  onProgress?: (fraction: number) => void,
): Promise<AudioResolution> {
  // 1. Local cache hit.
  try {
    const cached = await getCachedAudioPath(songId);
    if (cached) return { uri: cached, source: 'cache' };
  } catch {}

  // 2. In our catalog → signed R2 URL, then cache it locally like before.
  try {
    const { useAuthStore } = await import('@/store/authStore');
    const token = useAuthStore.getState().token ?? undefined;
    const { url } = await api.stream(songId, token);
    if (url) {
      const uri = await downloadToCache(songId, url);
      return { uri, source: 'catalog' };
    }
  } catch {
    // Not in the catalog (404), or backend unreachable. Fall through.
  }

  // 3. On-device extraction.
  const ytdlp = await getYtDlp();
  if (ytdlp) {
    try {
      // audioOnly prefers AAC (.m4a), which is a single stream — no ffmpeg
      // merge/transcode needed, and none is bundled.
      const task = ytdlp.download(youtubeUrl(songId), {
        audioOnly: true,
        networkRetries: 2,
        onProgress: (e) => {
          if (!onProgress) return;
          const pct = typeof e?.percent === 'number' ? e.percent / 100 : null;
          const ratio =
            pct ??
            (typeof e?.downloadedBytes === 'number' && typeof e?.totalBytes === 'number' && e.totalBytes > 0
              ? e.downloadedBytes / e.totalBytes
              : null);
          if (ratio != null && Number.isFinite(ratio)) {
            onProgress(Math.max(0, Math.min(1, ratio)));
          }
        },
      });
      const result = await task.promise;
      const src = result?.files?.[0];
      if (src) {
        // KEEP the real container extension. Players resolve local files by
        // extension, so renaming a WebM/Opus stream to .m4a makes it
        // unplayable. Cache path is <songId>.<ext>.
        const ext = (src.match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1] ?? 'm4a').toLowerCase();
        const dest = `${audioCacheDir()}${songId}.${ext}`;
        const moved = await normalizeToCachePath(src, dest);
        const local = await registerCachedFile(songId, moved);
        return { uri: local ?? moved, source: 'device' };
      }
    } catch (e: any) {
      // ERR_YTDLP means yt-dlp itself failed: bot check, login required,
      // age gate, or a removed video. Retrying won't help — surface it.
      throw new Error(e?.message?.slice?.(0, 200) || 'On-device extraction failed');
    }
  }

  throw new Error('Could not resolve audio for this track');
}

export type YouTubeSearchHit = {
  id: string;
  title: string;
  url: string;
  durationSec: number;
};

/**
 * Search YouTube directly from the device. Returns an empty list when
 * on-device extraction isn't available (web, iOS, Expo Go).
 */
export async function searchYouTube(query: string, limit = 10): Promise<YouTubeSearchHit[]> {
  const ytdlp = await getYtDlp();
  if (!ytdlp) return [];
  try {
    const entries = await ytdlp.search(query, { limit });
    return (entries ?? []).map((e: any) => ({
      id: String(e.id ?? e.videoId ?? ''),
      title: String(e.title ?? ''),
      url: String(e.url ?? (e.id ? youtubeUrl(String(e.id)) : '')),
      durationSec: Number(e.duration ?? 0),
    })).filter((h: YouTubeSearchHit) => h.id && h.url);
  } catch {
    return [];
  }
}
