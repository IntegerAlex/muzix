import TrackPlayer, { Event, RepeatMode } from '@rntp/player';
import type { Song } from '@/services/types';

let initialized = false;

function toMediaItem(song: Song) {
  return {
    id: song.id,
    url: song.audioUrl as string,
    title: song.title,
    artist: song.artist,
    album: song.album,
    duration: song.durationMs / 1000,
  };
}

export async function setupPlayer() {
  if (initialized) return;
  try {
    await TrackPlayer.setupPlayer();
    initialized = true;
  } catch (e) {
    console.error('TrackPlayer setup failed', e);
  }
}

export async function addQueue(queue: Song[], index = 0) {
  await setupPlayer();
  await TrackPlayer.setMediaItems(queue.map(toMediaItem), Math.max(0, index));
}

export async function play() {
  await TrackPlayer.play();
}

export async function pause() {
  await TrackPlayer.pause();
}

export async function skipToIndex(index: number) {
  await TrackPlayer.skipToIndex(index);
}

export async function next() {
  await TrackPlayer.skipToNext();
}

export async function previous() {
  await TrackPlayer.skipToPrevious();
}

export async function setVolume(v: number) {
  await TrackPlayer.setVolume(v);
}

export async function seek(seconds: number) {
  await TrackPlayer.seekTo(seconds);
}

export async function setRepeat(mode: 'off' | 'all' | 'one') {
  const map: Record<string, RepeatMode> = {
    off: RepeatMode.Off,
    all: RepeatMode.All,
    one: RepeatMode.One,
  };
  await TrackPlayer.setRepeatMode(map[mode]);
}
