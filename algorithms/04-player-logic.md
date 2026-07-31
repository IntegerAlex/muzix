# 04 — Player Logic

Next/previous navigation, queue reorder, and track completion detection.

- **Type**: Custom
- **File**: `web/muzix/store/playerStore.ts`, lines 165–340 (navigation, queue ops)
- **File**: `web/muzix/components/PlayerBridge.tsx`, lines 300–337 (completion detection)

## How it works

### 1. Next Track (lines 165–195)

Advances to the next track. Handles three repeat modes:

| Condition | Behavior |
|-----------|----------|
| `ni >= queue.length` + `repeat === 'all'` | Wrap to `queue[0]` |
| `ni >= queue.length` + `repeat === 'one'` | Replay current (push current index to history) |
| `ni >= queue.length` + `repeat === 'off'` | Stop playing (`isPlaying: false`) |
| `ni < queue.length` | Play `queue[ni]` |

Every transition pushes `currentIndex` to the `history` array (stack).

### 2. Previous Track (lines 197–215)

Uses a history stack for back-navigation:

```
if history is not empty:
    prevIndex = history.pop()     // restore previous position
    play queue[prevIndex]
else:
    play queue[max(0, currentIndex - 1)]
```

### 3. Queue Reorder (lines 324–340)

Move a song from position `from` to position `to`, adjusting `currentIndex` to follow the currently playing song:

```typescript
const [moved] = newQueue.splice(from, 1);
newQueue.splice(to, 0, moved);

if (from === currentIndex) newIndex = to;
else if (from < currentIndex && to >= currentIndex) newIndex = currentIndex - 1;
else if (from > currentIndex && to <= currentIndex) newIndex = currentIndex + 1;
```

### 4. Queue Remove (lines 304–322)

Remove a song by index, adjusting `currentIndex`:

| Condition | Adjustment |
|-----------|------------|
| `index < currentIndex` | `currentIndex - 1` |
| `index === currentIndex` | `Math.min(currentIndex, newQueue.length - 1)` |
| `index > currentIndex` | No change |

### 5. Track Completion Detection (PlayerBridge.tsx, lines 300–337)

Two detection mechanisms:

**Primary**: `status.didJustFinish` flag from the audio player (line 319). If true and `currentTime >= duration - 0.05`, fire completion and seek to 0 to prevent double-fire.

**Fallback**: Manual 98% completion check (line 333):
```typescript
if (!didJustFinishRef.current && curr >= status.duration * 0.98 && isPlaying) {
  handleTrackComplete();
}
```

**Seek-back guard** (line 330): If `currentTime` drops by more than 0.5s, reset `didJustFinishRef` to allow re-triggering.

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Completion threshold | 0.98 (98% of duration) | Fallback detection |
| Finish threshold | duration - 0.05s | Primary detection |
| Seek-back detection | -0.5s | Resets finish flag |

## Input → Output

- **Input**: Current queue, current index, repeat mode, playback position
- **Output**: Updated queue position, playback state, history stack
