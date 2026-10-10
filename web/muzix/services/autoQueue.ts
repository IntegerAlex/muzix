import { Platform } from 'react-native';
import type { Song } from '@/services/types';
import { searchYouTube } from '@/services/audioSource';

const IS_WEB = Platform.OS === 'web';

/**
 * How many tracks to pull when the queue runs dry. YouTube Mixes are randomly
 * generated and can report thousands of entries, so this is also the fetch cap
 * — pulling the whole mix would be many round trips for no benefit.
 */
export const AUTOPLAY_BATCH = 25;

let _ytdlp: typeof import('expo-yt-dlp') | null = null;
let _loaded = false;

async function getYtDlp(): Promise<typeof import('expo-yt-dlp') | null> {
  if (_loaded) return _ytdlp;
  _loaded = true;
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

/** A YouTube video id is 11 chars of [A-Za-z0-9_-]. */
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
export function looksLikeYouTubeId(id: string): boolean {
  return YT_ID.test(id);
}

function songFromEntry(
  entry: { id: string; title?: string | null; duration?: number | null; uploader?: string | null; thumbnail?: string | null },
  fallbackArtist?: string,
): Song | null {
  const id = String(entry.id ?? '');
  if (!YT_ID.test(id)) return null;
  const title = (entry.title ?? '').trim();
  if (!title) return null;
  const durationSec = Number(entry.duration ?? 0) || 0;
  const artist = (entry.uploader ?? fallbackArtist ?? 'YouTube').trim() || 'YouTube';
  return {
    id,
    title,
    artist,
    artistId: 'youtube',
    album: artist,
    albumId: 'youtube',
    genre: '',
    duration: durationSec ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : '',
    durationMs: durationSec * 1000,
    colors: ['#6d28d9', '#db2777'],
    imageUrl: entry.thumbnail ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

/**
 * Ask YouTube what should play after `seedId`.
 *
 * Strategy, cheapest first:
 *  1. The song's auto-generated Mix (`list=RD{id}`) — YouTube's own radio
 *     algorithm, seeded on this exact video. Best quality, one request.
 *  2. Fall back to a search on "{title} {artist}" if the mix is empty or the
 *     seed has no mix (some videos have none).
 *
 * Returns an empty array when on-device extraction is unavailable or YouTube
 * gives us nothing — callers should treat that as "stop playing", not an error.
 */
export async function fetchUpNext(
  seedId: string,
  seed?: Pick<Song, 'title' | 'artist'> | null,
  limit = AUTOPLAY_BATCH,
): Promise<Song[]> {
  const ytdlp = await getYtDlp();
  if (!ytdlp || !YT_ID.test(seedId)) return [];

  // 1. The seed's own Mix.
  try {
    const mixUrl = `https://www.youtube.com/watch?v=${seedId}&list=RD${seedId}`;
    // `playlist: true` is REQUIRED: for a watch?v=…&list=… URL yt-dlp otherwise
    // resolves only the single video. `flatPlaylist` lists the entries without
    // resolving each one — much faster and enough for id/title/duration.
    const playlist = await ytdlp.getPlaylist(mixUrl, {
      limit,
      playlist: true,
      flatPlaylist: true,
    });
    const entries = playlist?.entries ?? [];
    const songs = entries
      .filter((e: any) => e?.id && e.id !== seedId) // drop the seed itself
      .map((e: any) => songFromEntry(e, seed?.artist))
      .filter((s: Song | null): s is Song => s != null);
    if (songs.length) return dedupeById(songs);
  } catch {
    // fall through to search
  }

  // 2. Search fallback, seeded on the current track's metadata.
  if (seed?.title) {
    const q = `${seed.title} ${seed.artist ?? ''}`.trim();
    const hits = await searchYouTube(q, limit);
    const songs = hits
      .filter((h) => h.id && h.id !== seedId)
      .map((h) => songFromEntry({ id: h.id, title: h.title, duration: h.durationSec }, seed.artist))
      .filter((s: Song | null): s is Song => s != null);
    return dedupeById(songs);
  }

  return [];
}

function dedupeById(songs: Song[]): Song[] {
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const s of songs) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}
