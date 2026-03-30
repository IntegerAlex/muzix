// Audio compression service using system file storage
import type { BunFile } from "bun";
import { join, basename, extname } from "path";
import { existsSync, mkdirSync } from "fs";

const STORAGE_BASE = process.env.STORAGE_BASE || join(process.cwd(), "storage");
const MUSIC_DIR = join(STORAGE_BASE, "music");
const COMPRESSED_DIR = join(STORAGE_BASE, "compressed");
const CHUNKS_DIR = join(STORAGE_BASE, "chunks");
const ARTWORK_DIR = join(STORAGE_BASE, "artwork");

// Ensure directories exist
[MUSIC_DIR, COMPRESSED_DIR, CHUNKS_DIR, ARTWORK_DIR].forEach((dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

export interface AudioMetadata {
  title: string;
  artist: string;
  album?: string;
  duration: number; // in seconds
  genre?: string;
  year?: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  fileSize: number;
  format: string;
}

export interface CompressionResult {
  originalPath: string;
  compressedPath: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  metadata: AudioMetadata;
}

/**
 * Store uploaded audio file and return path
 */
export async function storeAudioFile(
  file: BunFile,
  trackId: string
): Promise<{ path: string; size: number }> {
  const ext = extname(file.name || "audio").toLowerCase();
  const filename = `${trackId}${ext}`;
  const filePath = join(MUSIC_DIR, filename);

  // Write file to disk
  await Bun.write(filePath, file);

  const stats = await Bun.file(filePath).stat();
  return { path: filePath, size: stats.size };
}

/**
 * Compress audio file using ffmpeg (if available) or store as-is
 * Supports FLAC, OGG, MP3, AAC formats
 */
export async function compressAudio(
  inputPath: string,
  trackId: string,
  targetFormat: "ogg" | "mp3" | "flac" = "ogg"
): Promise<CompressionResult> {
  const inputExt = extname(inputPath).toLowerCase();
  const inputFile = Bun.file(inputPath);
  const originalSize = (await inputFile.stat()).size;

  // Extract metadata using flac-metadata or basic parsing
  const metadata = await extractMetadata(inputPath);

  const outputFilename = `${trackId}.${targetFormat}`;
  const outputPath = join(COMPRESSED_DIR, outputFilename);

  // For now, we'll copy the file (in production, use ffmpeg for actual compression)
  // Check if ffmpeg is available
  const hasFFmpeg = await checkFFmpeg();

  if (hasFFmpeg && shouldCompress(inputExt, targetFormat)) {
    await compressWithFFmpeg(inputPath, outputPath, targetFormat);
  } else {
    // If no ffmpeg or same format, just copy
    await Bun.write(outputPath, inputFile);
  }

  const compressedFile = Bun.file(outputPath);
  const compressedSize = (await compressedFile.stat()).size;

  return {
    originalPath: inputPath,
    compressedPath: outputPath,
    originalSize,
    compressedSize,
    compressionRatio: ((originalSize - compressedSize) / originalSize) * 100,
    metadata,
  };
}

/**
 * Check if ffmpeg is available
 */
async function checkFFmpeg(): Promise<boolean> {
  try {
    const { spawnSync } = await import("child_process");
    const result = spawnSync("which", ["ffmpeg"], { encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Determine if compression is needed
 */
function shouldCompress(inputExt: string, targetFormat: string): boolean {
  const formatMap: Record<string, string[]> = {
    ".flac": ["ogg", "mp3"],
    ".wav": ["ogg", "mp3", "flac"],
    ".aiff": ["ogg", "mp3", "flac"],
    ".m4a": ["ogg", "mp3"],
    ".ogg": ["mp3"],
    ".mp3": [],
  };

  const targets = formatMap[inputExt] || [];
  return targets.includes(targetFormat);
}

/**
 * Compress audio using ffmpeg
 */
async function compressWithFFmpeg(
  inputPath: string,
  outputPath: string,
  targetFormat: string
): Promise<void> {
  const qualitySettings: Record<string, string[]> = {
    ogg: ["-c:a", "libvorbis", "-q:a", "6"], // ~160kbps
    mp3: ["-c:a", "libmp3lame", "-q:a", "4"], // ~175kbps
    flac: ["-c:a", "flac", "-compression_level", "8"],
  };

  const { spawnSync } = await import("child_process");
  const settings = qualitySettings[targetFormat] || [];
  const args = [
    "-i",
    inputPath,
    ...settings,
    "-y", // overwrite output
    outputPath,
  ];

  const result = spawnSync("ffmpeg", args, { encoding: "utf-8" });
  if (result.error) {
    throw result.error;
  }
}

/**
 * Extract metadata from audio file
 */
export async function extractMetadata(filePath: string): Promise<AudioMetadata> {
  const file = Bun.file(filePath);
  const stats = await file.stat();
  const ext = extname(filePath).toLowerCase().slice(1);

  // Basic metadata extraction
  // In production, use proper libraries like 'music-metadata' or ffprobe
  let metadata: Partial<AudioMetadata> = {
    fileSize: stats.size,
    format: ext,
  };

  // Try to get duration and other info using ffprobe if available
  try {
    const hasFFprobe = await checkFFprobe();
    if (hasFFprobe) {
      metadata = await extractMetadataWithFFprobe(filePath);
    }
  } catch (error) {
    console.warn("Failed to extract metadata with ffprobe:", error);
  }

  // Fallback defaults
  return {
    title: basename(filePath, extname(filePath)),
    artist: "Unknown Artist",
    album: "Unknown Album",
    duration: metadata.duration || 0,
    genre: metadata.genre || "Unknown",
    year: metadata.year || new Date().getFullYear(),
    bitrate: metadata.bitrate || 128,
    sampleRate: metadata.sampleRate || 44100,
    channels: metadata.channels || 2,
    fileSize: stats.size,
    format: ext,
  };
}

/**
 * Check if ffprobe is available
 */
async function checkFFprobe(): Promise<boolean> {
  try {
    const { spawnSync } = await import("child_process");
    const result = spawnSync("which", ["ffprobe"], { encoding: "utf-8" });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Extract metadata using ffprobe
 */
async function extractMetadataWithFFprobe(
  filePath: string
): Promise<Partial<AudioMetadata>> {
  const { spawnSync } = await import("child_process");
  const result = spawnSync(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { encoding: "utf-8" }
  );
  
  if (result.error || !result.stdout) {
    return {};
  }
  
  const data = JSON.parse(result.stdout);

  const audioStream = data.streams?.find((s: any) => s.codec_type === "audio");
  const format = data.format;

  return {
    duration: format?.duration ? parseFloat(format.duration) : 0,
    bitrate: format?.bit_rate ? parseInt(format.bit_rate) / 1000 : 128,
    sampleRate: audioStream?.sample_rate ? parseInt(audioStream.sample_rate) : 44100,
    channels: audioStream?.channels || 2,
    genre: format?.tags?.genre,
    year: format?.tags?.date ? parseInt(format.tags.date) : undefined,
  };
}

/**
 * Create chunks for streaming (adaptive bitrate)
 * Creates 10-second chunks for efficient streaming
 */
export async function createChunks(
  audioPath: string,
  trackId: string,
  chunkDuration: number = 10
): Promise<string[]> {
  const trackChunksDir = join(CHUNKS_DIR, trackId);
  if (!existsSync(trackChunksDir)) {
    mkdirSync(trackChunksDir, { recursive: true });
  }

  const hasFFmpeg = await checkFFmpeg();
  if (!hasFFmpeg) {
    // Without ffmpeg, return the whole file as single chunk
    return [audioPath];
  }

  // Get duration first
  const metadata = await extractMetadata(audioPath);
  const totalDuration = metadata.duration;
  const chunkCount = Math.ceil(totalDuration / chunkDuration);

  const chunkPaths: string[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const startTime = i * chunkDuration;
    const chunkFilename = `${trackId}_chunk_${i.toString().padStart(4, "0")}.ogg`;
    const chunkPath = join(trackChunksDir, chunkFilename);

    const { spawnSync } = await import("child_process");
    const args = [
      "-i",
      audioPath,
      "-ss",
      startTime.toString(),
      "-t",
      chunkDuration.toString(),
      "-c:a",
      "libvorbis",
      "-q:a",
      "5",
      "-y",
      chunkPath,
    ];

    const result = spawnSync("ffmpeg", args, { encoding: "utf-8" });
    if (!result.error) {
      chunkPaths.push(chunkPath);
    }
  }

  return chunkPaths;
}

/**
 * Stream audio file with range support
 */
export async function streamAudio(
  filePath: string,
  rangeHeader?: string
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: ReadableStream | null;
}> {
  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (!exists) {
    return {
      status: 404,
      headers: { "Content-Type": "application/json" },
      body: null,
    };
  }

  const stats = await file.stat();
  const fileSize = stats.size;
  const mimeType = getMimeType(filePath);

  if (!rangeHeader) {
    // No range request, send entire file
    return {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": fileSize.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000",
      },
      body: file.stream(),
    };
  }

  // Parse range header
  const ranges = (rangeHeader || "").replace(/bytes=/, "").split("-");
  const start = parseInt(ranges[0], 10);
  const end = ranges[1] ? parseInt(ranges[1], 10) : fileSize - 1;

  // Validate range
  if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize) {
    return {
      status: 416,
      headers: {
        "Content-Type": "application/json",
        "Content-Range": `bytes */${fileSize}`,
      },
      body: null,
    };
  }

  // Adjust end if it exceeds file size
  const actualEnd = Math.min(end, fileSize - 1);
  const chunkSize = actualEnd - start + 1;

  // Create stream with range
  const stream = file.slice(start, actualEnd + 1).stream();

  return {
    status: 206,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": chunkSize.toString(),
      "Content-Range": `bytes ${start}-${actualEnd}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000",
    },
    body: stream,
  };
}

/**
 * Get MIME type based on file extension
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".webm": "audio/webm",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Store artwork image
 */
export async function storeArtwork(
  file: BunFile,
  trackId: string
): Promise<string> {
  const ext = extname(file.name || "image").toLowerCase();
  const validExts = [".jpg", ".jpeg", ".png", ".webp"];

  if (!validExts.includes(ext)) {
    throw new Error("Invalid artwork format. Use JPG, PNG, or WebP");
  }

  const filename = `${trackId}${ext}`;
  const filePath = join(ARTWORK_DIR, filename);

  await Bun.write(filePath, file);
  return filePath;
}

/**
 * Delete track files
 */
export async function deleteTrackFiles(
  trackId: string,
  paths: {
    original?: string | null;
    compressed?: string | null;
    artwork?: string | null;
  }
): Promise<void> {
  const filesToDelete = [paths.original, paths.compressed, paths.artwork].filter(
    (f): f is string => Boolean(f)
  );

  for (const filePath of filesToDelete) {
    try {
      await import("fs").then((fs) => fs.promises.unlink(filePath));
    } catch (error) {
      console.warn(`Failed to delete file ${filePath}:`, error);
    }
  }

  // Delete chunks directory
  const chunksDir = join(CHUNKS_DIR, trackId);
  try {
    const { rmSync } = await import("fs");
    rmSync(chunksDir, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}
