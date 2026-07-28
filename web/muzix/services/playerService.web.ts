import type { Song } from '@/services/types';

// Web: handled by PlayerBridge
export function songToTrack(_song: Song) { return undefined; }
// Web: handled by PlayerBridge
export async function setupPlayer(): Promise<void> {}
// Web: handled by PlayerBridge
export async function addQueue(_tracks: Song[], _startIndex?: number): Promise<void> {}
// Web: handled by PlayerBridge
export async function loadTrack(_song: Song): Promise<void> {}
// Web: handled by PlayerBridge
export async function play(): Promise<void> {}
// Web: handled by PlayerBridge
export async function pause(): Promise<void> {}
// Web: handled by PlayerBridge
export async function stop(): Promise<void> {}
// Web: handled by PlayerBridge
export async function seek(_seconds: number): Promise<void> {}
// Web: handled by PlayerBridge
export async function next(): Promise<void> {}
// Web: handled by PlayerBridge
export async function previous(): Promise<void> {}
// Web: handled by PlayerBridge
export async function setVolume(_v: number): Promise<void> {}
// Web: handled by PlayerBridge
export async function skipToIndex(_index: number): Promise<void> {}
