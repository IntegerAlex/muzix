# 13 — Lyrics & Color

LRC timestamp parsing, plain-text timing, and deterministic color generation.

- **Type**: Custom
- **File**: `web/muzix/components/LyricsPanel.tsx`, lines 21–48 (lyrics parsing)
- **File**: `backend/helpers.py`, lines 300–310 (color generation)
- **File**: `web/muzix/components/Artwork.tsx`, lines 14–29 (color mixing)

## How it works

### 1. LRC Timestamp Parser (`parseLRC`, LyricsPanel.tsx lines 21–34)

Parses timestamped lyrics in LRC format using regex:

```typescript
const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/g;

while ((match = regex.exec(lrc)) !== null) {
  const min = parseInt(match[1], 10);
  const sec = parseInt(match[2], 10);
  const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
  const time = min * 60 + sec + ms / 1000;
  lines.push({ time, text: match[4].trim() });
}
return lines.sort((a, b) => a.time - b.time);
```

### 2. Plain Text to Timed Lines (`plainTextToLines`, lines 40–48)

For non-LRC lyrics, distributes lines evenly across a 100-second timeline:

```typescript
return text.split('\n').filter(l => l.trim()).map((line, i, arr) => ({
  time: (i / arr.length) * 100,  // distribute evenly across 100s
  text: line.trim(),
}));
```

### 3. Active Lyric Line Detection (lines 70–91)

Reverse linear scan to find the last line whose timestamp ≤ current playback time:

```typescript
for (let i = lines.length - 1; i >= 0; i--) {
  if (currentTime >= lines[i].time) {
    idx = i;
    break;
  }
}
```

### 4. MD5-Based Color Generation (`colors_from_title`, helpers.py lines 300–310)

Generates two gradient colors from a title string:

```python
def colors_from_title(title: str) -> list[str]:
    h = hashlib.md5(title.encode()).hexdigest()
    hue1 = int(h[:3], 16) % 360
    hue2 = (hue1 + 40 + int(h[3:6], 16) % 60) % 360
    r1, g1, b1 = colorsys.hls_to_rgb(hue1 / 360, 0.5, 0.65)
    r2, g2, b2 = colorsys.hls_to_rgb(hue2 / 360, 0.5, 0.65)
    return [f"#{int(r1*255):02x}...", f"#{int(r2*255):02x}..."]
```

- Hue 1: first 3 hex chars of MD5 mod 360
- Hue 2: Hue 1 + 40 + (next 3 chars mod 60) — ensures colors are 40–100 degrees apart
- Lightness: 0.5, Saturation: 0.65 (both fixed)

### 5. Color Mixing (`mixColor`, Artwork.tsx lines 14–29)

Simple RGB channel averaging for 3-stop gradients:

```typescript
function mixColor(a: string, b: string): string {
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return `rgb(${Math.round((r1+r2)/2)}, ${Math.round((g1+g2)/2)}, ${Math.round((b1+b2)/2)})`;
}
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Plain-text timeline | 100 seconds | Even distribution |
| Hue separation | 40–100 degrees | Ensures visually distinct colors |
| Lightness | 0.5 | Fixed |
| Saturation | 0.65 | Fixed |

## Input → Output

- **Input**: LRC/plain-text lyrics, title string, hex colors
- **Output**: Parsed lyric lines with timestamps, deterministic gradient colors
