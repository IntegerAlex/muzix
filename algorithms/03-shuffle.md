# 03 — Shuffle

Fisher-Yates shuffle and state-preserving unshuffle toggle.

- **Type**: Known algorithm (Fisher-Yates / Knuth) + Custom toggle logic
- **File**: `web/muzix/store/playerStore.ts`, lines 83–90 (shuffle), 217–239 (toggle)

## How it works

### 1. Fisher-Yates Shuffle (`shuffleArray`, lines 83–90)

Standard in-place unbiased shuffle. Returns a new array (non-destructive).

```typescript
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
```

**Complexity**: O(n) time, O(n) space (copy).

### 2. Toggle Shuffle On (`toggleShuffle`, lines 219–229)

When enabling shuffle:
1. Extract the current song from the queue
2. Filter out the current song from the remaining queue
3. Shuffle the remaining songs with Fisher-Yates
4. Prepend the current song to position 0
5. Clear history stack

```typescript
const remaining = queue.filter((_, i) => i !== currentIndex);
const shuffled = shuffleArray(remaining);
const newQueue = current ? [current, ...shuffled] : shuffled;
set({ shuffle: true, queue: newQueue, currentIndex: 0, history: [] });
```

### 3. Toggle Shuffle Off (`toggleShuffle`, lines 231–238)

When disabling shuffle:
1. Find the current song's position in the original (pre-shuffle) queue
2. Restore `originalQueue` as the active queue
3. Set `currentIndex` to the found position

```typescript
const newIndex = current ? originalQueue.findIndex(s => s.id === current.id) : 0;
set({ shuffle: false, queue: originalQueue, currentIndex: newIndex });
```

## Constants

| Parameter | Value | Notes |
|-----------|-------|-------|
| Shuffle algorithm | Fisher-Yates | Unbiased, O(n) |
| Current song position | Always index 0 when shuffle is on | Guarantees current song plays next |

## Input → Output

- **Input**: Current queue (array of Song objects) and current index
- **Output**: New queue with current song at index 0, rest shuffled
