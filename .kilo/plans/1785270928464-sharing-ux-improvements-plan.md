# MUZIX Sharing & UX Improvements Plan

## Goal
Complete lyrics sharing, add comprehensive content sharing with deep links, and deliver high-priority UX improvements across the app.

## Current State

### Lyrics Sharing
- Client-side fully built: `useLyricsSharing` hook, `LyricsImageGenerator`, `LyricsPanel` multi-select (up to 5 lines)
- Generates 16:9 shareable PNG via `react-native-view-shot`
- Has preview modal with share/download actions
- **Missing**: backend endpoint, error UI, text-only option, song timestamp in image, web capture fixes

### Content Sharing
- Album/playlist screens have basic `Share.share()` plain text only
- No song-level, artist-level sharing
- No deep links/URLs
- No web-compatible sharing (uses RN `Share.share` which doesn't work on web)
- Silent `catch {}` swallows errors
- No share buttons in MiniPlayer, NowPlaying header, SongRow, search results, home screen

### Queue UX
- No visible queue management UI
- Queue state exists in store but no panel to view/reorder/remove

### Other UX Gaps
- No keyboard shortcuts for web/desktop
- No haptic feedback
- No persistent offline banner
- Missing pull-to-refresh on album/artist/playlist/profile screens
- Inconsistent empty states

## Key Decisions

1. **Share backend**: Single `/api/share/generate` endpoint returning shareable URL + metadata. Token-based, 30-day expiry.
2. **Unified sharing**: New `useSharing` hook handles all content types (song/album/artist/playlist/lyrics) with web/native fallback.
3. **Lyrics share modes**: Image (existing) + text-only option. Both go through `useSharing` for consistency.
4. **Queue panel**: Slide-up modal from MiniPlayer, accessible via queue icon. Supports reorder, remove, clear.
5. **Keyboard shortcuts**: Web/desktop only. Space=play/pause, arrows=seek/volume, N/P=next/prev, L=like, Q=queue, Esc=close.
6. **Haptics**: Light impact on button press, success on like, error on failures. Web no-op.
7. **Offline banner**: Persistent top banner when `useConnectivity` reports offline.
8. **Implementation order**: Backend → sharing hook → component wiring → lyrics improvements → queue → keyboard/haptics/offline → polish.
9. **Frontend share route**: Add `/share/[token]` screen that fetches share metadata and shows content. If app is installed, deep link opens app; otherwise shows web fallback.
10. **Lyrics sharing integration**: Keep `useLyricsSharing` for image generation, but route the final share action through `useSharing` so all shares get tracked. Add text-only mode directly in `LyricsPanel` without image generation.

## Implementation Tasks

### Backend (2 tasks)

**1. Share endpoint + model**
- Create `backend/routes/share.py` with `POST /generate` and `GET /{token}`
- Create `backend/models/share.py` with `Share` model
- Add migration for `shares` table
- Wire into `main.py` router
- Track share events via existing telemetry

**2. Share validation helpers**
- Add `validate_content(type, id)` to verify content exists
- Add `get_content_metadata(type, id)` to return title/artist/image for share responses

**3. Share route schema & errors**
```python
# Request
{
    "content_type": "song | album | artist | playlist | lyrics",
    "content_id": "uuid",
    "selected_lyrics_lines": [0, 2, 5]  # optional, for lyrics
}

# Response
{
    "share_token": "abc123",
    "share_url": "https://muzix.app/share/abc123",
    "content_type": "song",
    "content_id": "uuid",
    "title": "Song Title",
    "artist": "Artist Name",
    "image_url": "https://...",
    "expires_at": "2026-08-29T00:00:00Z"
}

# Errors
401 - Not authenticated
404 - Content not found
429 - Rate limit (max 10 shares/minute)
500 - Server error
```

**4. Rate limiting**
- Apply existing rate limiter to `/share/generate` (10 req/min per user)
- No auth required for `GET /{token}` (public share links)

**5. Content validation logic**
```python
VALIDATORS = {
    "song": lambda id: db.get(Song, id),
    "album": lambda id: db.get(Album, id),
    "artist": lambda id: db.get(Artist, id),
    "playlist": lambda id: db.get(Playlist, id),
    "lyrics": lambda id: db.get(Song, id),  # lyrics tied to song
}
```

### Frontend Sharing (4 tasks)

**3. Unified `useSharing` hook**
- Create `web/muzix/hooks/useSharing.ts`
- Handles `generateShareLink()` → backend call
- Handles `share()` → Web Share API / RN Share / clipboard fallback
- Returns `{ share, isSharing, shareError, resetError }`
- **Deprecation path**: Keep `useLyricsSharing` for image generation only. Add `onShareText` callback for text-only lyrics shares. Route final share action through `useSharing` so all shares get tracked.

**4. Frontend share route**
- Create `web/muzix/app/share/[token].tsx`
- Fetches `GET /api/share/{token}` on mount
- Shows content preview (artwork, title, artist, "Open in MUZIX" button)
- If app installed, deep link opens app; otherwise shows web fallback
- Handles expired/invalid tokens with error state
- **Route structure**:
  ```typescript
  // app/share/[token].tsx
  export default function ShareScreen({ params }: { params: { token: string } }) {
    const { data, loading, error } = useShare(params.token);
    if (loading) return <LoadingSkeleton />;
    if (error || !data) return <ShareErrorScreen error={error} />;
    return <SharePreview content={data.content} share={data.share} />;
  }
  ```
- **Deep linking**: Add `expo-linking` config for `muzix://share/{token}`. If app opens via deep link, navigate to content directly.
- **Error states**:
  - 404: "This share link is invalid or has expired"
  - Network error: "Can't load share preview. Check your connection."
  - Both have retry button and "Go to Home" link

**5. Lyrics sharing deprecation path**
- Keep `useLyricsSharing` for image generation only
- Add `onShareText` callback to `LyricsPanel` for text-only shares
- In `NowPlaying.tsx`:
  ```typescript
  const { share } = useSharing();
  const { generate, shareUri, isGenerating, shareError } = useLyricsSharing();
  
  // Image share: generate image, then share via useSharing
  const handleShareImage = async (selectedTexts: string[]) => {
    await generate(); // generates image
    if (shareUri) {
      await share({
        contentType: 'lyrics',
        contentId: current.id,
        title: current.title,
        artist: current.artist,
        imageUrl: shareUri,
        lyrics: current.lyrics?.split('\n') || [],
        selectedLyricsLines: selectedTexts.map(t => current.lyrics?.indexOf(t) || 0),
      });
    }
  };
  
  // Text share: directly share text via useSharing
  const handleShareText = async (selectedTexts: string[]) => {
    await share({
      contentType: 'lyrics',
      contentId: current.id,
      title: current.title,
      artist: current.artist,
      lyrics: selectedTexts,
      selectedLyricsLines: selectedTexts.map(t => current.lyrics?.indexOf(t) || 0),
    });
  };
  ```
- **Migration**: Remove direct `Share.share()` calls from `LyricsPanel`. All share actions funnel through `useSharing`.

**5. Wire share buttons into components**
- `SongRow.tsx`: add Share2 icon button (passed via prop or internal hook call)
- `NowPlaying.tsx`: add share button in header
- `MiniPlayer.tsx`: add share button (desktop/landscape only)
- `album/[id].tsx`: replace existing `handleShare` with `useSharing`
- `artist/[id].tsx`: add share button
- `playlist/[id].tsx`: replace existing `handleShare` with `useSharing`
- `search.tsx`: add share on song/album/artist results
- `index.tsx`: add share on hero cards and top picks

**6. Lyrics sharing improvements**
- Add error UI for lyrics share failure (retry button)
- Add text-only/image mode toggle in `LyricsPanel`
- Add song timestamp to `LyricsImageGenerator`
- Fix web view capture rendering

**7. Share error handling**
- Replace all `catch {}` swallowers with proper error display
- Add `shareError` state to affected components
- Show toast + inline error with retry
- **Specific locations to fix**:
  - `app/(tabs)/album/[id].tsx:79` — `handleCreatePlaylist` catch block
  - `app/(tabs)/playlist/[id].tsx` — share handler
  - `components/NowPlaying.tsx` — share error state already exists but not displayed

### Queue UX (2 tasks)

**7. QueuePanel component**
- Create `web/muzix/components/QueuePanel.tsx`
- Slide-up modal, max 70% height
- Shows queue with track numbers, artwork, title, artist
- Current track highlighted
- Remove button per item
- Clear all button
- Add `moveInQueue` to `playerStore.ts`
- **Drag reorder on web**: Use HTML5 drag-and-drop API:
  ```typescript
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      moveInQueue(dragIndex, index);
      setDragIndex(index);
    }
  };
  const handleDragEnd = () => setDragIndex(null);
  
  // On each item:
  <Pressable
    draggable
    onDragStart={() => handleDragStart(i)}
    onDragOver={(e) => handleDragOver(e, i)}
    onDragEnd={handleDragEnd}
    style={{ opacity: dragIndex === i ? 0.5 : 1 }}
  >
  ```
- **Drag reorder on native**: Use `react-native-reanimated` `Gesture`:
  ```typescript
  const gesture = Gesture.Pan()
    .onBegin(() => setActiveIndex(i))
    .onUpdate((e) => {
      if (activeIndex !== null && Math.abs(e.translationY) > 20) {
        const direction = e.translationY > 0 ? 1 : -1;
        const targetIndex = activeIndex + direction;
        if (targetIndex >= 0 && targetIndex < queue.length) {
          moveInQueue(activeIndex, targetIndex);
          setActiveIndex(targetIndex);
        }
      }
    })
    .onEnd(() => setActiveIndex(null));
  ```
- **Fallback buttons**: Show up/down arrow buttons on each item if drag fails or on platforms without drag support.
- **Accessibility**: `accessibilityRole="list"` on container, `accessibilityRole="button"` on each item, `accessibilityLabel` includes position and "Now playing" status.

**8. Wire QueuePanel**
- Add queue icon button to `MiniPlayer.tsx`
- Add `QueuePanel` to `app/_layout.tsx`
- Long press / swipe up on MiniPlayer opens queue (optional enhancement)
- Queue icon visible on all screen sizes, but text label "Queue" only on desktop/landscape

### UX Polish (5 tasks)

**9. Keyboard shortcuts**
- Create `web/muzix/hooks/useKeyboardShortcuts.ts`
- Wire in `app/_layout.tsx` (web/desktop only)
- Keys: Space, arrows, N, P, L, Q, Esc
- **Conflict avoidance**: Skip if `e.target` is `HTMLInputElement`, `HTMLTextAreaElement`, or contenteditable. Skip if `e.metaKey` or `e.ctrlKey` is pressed.
- **Platform check**: Only register on `Platform.OS === 'web'`. For desktop APK (Windows/Mac), use `Platform.OS === 'windows' || Platform.OS === 'macos'` if available, else fall back to web check.
- **Modal behavior**: Shortcuts still work when modals are open (e.g., Esc closes NowPlaying even if QueuePanel is open). Space only toggles play/pause if no input is focused.
- **Focus management**: When Esc closes NowPlaying, return focus to MiniPlayer. When Esc closes QueuePanel, return focus to queue icon.

**10. Haptic feedback**
- Create `web/muzix/hooks/useHaptics.ts`
- Add to play/pause, like, error events in `NowPlaying`, `MiniPlayer`, `SongRow`
- **Pattern**: Light impact on button press, medium on play/pause toggle, success notification on like, error notification on failures.
- **Web behavior**: No-op on web (guard with `Platform.OS !== 'web'`).

**11. Offline banner**
- Use existing `useConnectivity` hook
- Add persistent top banner in `app/_layout.tsx`
- **Height**: 32px compact banner, non-blocking. Uses `DANGER` background, white text.
- **Dismissible**: No — stays visible while offline. Shows "You're offline — some features may be limited".
- **Animation**: Slide down from top on mount, slide up on unmount.

**12. Pull-to-refresh on all screens**
- Add `RefreshControl` to `album/[id].tsx`, `artist/[id].tsx`, `playlist/[id].tsx`, `profile.tsx`
- **Pattern**: Use `useState` for `refreshing`, call existing `refetch` from data hooks.
- **Tint color**: `ACCENT` (#1DB954) for consistency.
- **Edge case**: Disable refresh while already loading to prevent duplicate requests.

**13. Empty state components**
- Create `web/muzix/components/EmptyStates.tsx` with `EmptyLibrary`, `EmptyQueue`, `NoNetwork`
- Replace inline empty states across screens
- **Consistency**: All empty states use `TEXT_MUTED` for description, `TEXT_PRIMARY` for heading, `SPACING.xxxl` for top padding.
- **Action buttons**: Where retry is relevant (NoNetwork, EmptyQueue), add accent-colored button.

## Validation

- [ ] Share generates working URL for all content types
- [ ] Share works on web, iOS, Android
- [ ] Lyrics share has both image and text modes
- [ ] Queue panel opens, displays items, supports remove/clear
- [ ] Keyboard shortcuts don't conflict with browser/input fields
- [ ] Haptics fire on native, no-op on web
- [ ] Offline banner appears when network disconnected
- [ ] All screens support pull-to-refresh
- [ ] Empty states render correctly on all screen sizes
- [ ] Share route `/share/[token]` resolves and displays content
- [ ] Expired share tokens show appropriate error
- [ ] Queue drag reorder works on touch and desktop
- [ ] Error boundaries catch share/queue failures gracefully

## Rollout & Migration

### Backend
1. Run Alembic migration for `shares` table:
   ```bash
   cd backend && alembic revision --autogenerate -m "add shares table"
   alembic upgrade head
   ```
2. Deploy `share.py` route — backward compatible, no existing routes changed
3. Add to `backend/main.py`:
   ```python
   from routes import share as share_router
   app.include_router(share_router.router, prefix="/api/share", tags=["share"])
   ```
4. Monitor telemetry for `share.created` events

### Frontend
1. Deploy `useSharing` hook and component changes — feature-flagged behind `ENABLE_SHARING`
2. Gradually enable: 10% → 50% → 100% over 3 days
3. Monitor crash rate and share success rate

### Feature Flag Setup
```typescript
// In tamagui.config.ts or featureFlags.ts
export const ENABLE_SHARING = __DEV__ || process.env.EXPO_PUBLIC_ENABLE_SHARING === 'true';
```

### Rollback Triggers
- Crash rate increase >0.5%
- Share failure rate >5%
- Queue panel causes memory leak (watch heap size)
- Keyboard shortcuts break input fields

## Error Boundary Coverage

Wrap new modals/panels with ErrorBoundary:
- `QueuePanel.tsx` — wrap entire modal content
- `share/[token].tsx` — wrap content area
- `LyricsImageGenerator.tsx` — already in NowPlaying which has ErrorBoundary

## Testing Strategy

### Unit Tests
- `__tests__/useSharing.test.ts` — mock fetch, test share flow, error states, resetError
- `__tests__/useKeyboardShortcuts.test.ts` — mock window events, test key mapping, conflict avoidance
- `__tests__/useHaptics.test.ts` — verify Platform.OS guard, verify no-op on web
- `__tests__/QueuePanel.test.tsx` — render with empty queue, populated queue, test remove/clear

### Integration Tests
- Share flow: button → generate link → share action → clipboard/web share
- Queue flow: open panel → remove item → verify store update → close panel
- Keyboard: press Space → verify play/pause toggles

### E2E Tests (Manual)
- Share song on iOS → verify native share sheet appears
- Share song on Android → verify native share sheet appears
- Share song on web → verify Web Share API or clipboard fallback
- Open share link on web → verify content preview renders
- Rotate device during NowPlaying → verify split-view adapts
- Open QueuePanel → drag reorder on touch → verify order changes

### Accessibility Tests
- Tab through share buttons on all screens
- Screen reader: verify share button labels announce correctly
- Keyboard: verify shortcuts work, Esc closes modals

### Test File Paths
```
__tests__/
  useSharing.test.ts
  useKeyboardShortcuts.test.ts
  useHaptics.test.ts
  QueuePanel.test.tsx
  share/
    [token].test.tsx
```

## Dependencies

### New npm packages needed
- None — all sharing uses existing `react-native-view-shot`, `expo-sharing`, `expo-haptics`, `lucide-react-native`
- Queue drag reorder uses existing `react-native-reanimated` gestures

### New Python dependencies
- None — uses existing `sqlalchemy`, `pydantic`, `secrets`

## Open Questions

| # | Question | Recommended Answer | Status |
|---|----------|-------------------|--------|
| 1 | Should share links open app or web? | Web first. Configure app links later. | Decided |
| 2 | Should lyrics image include song timestamp? | Yes, if > 0. | Decided |
| 3 | Queue reorder: drag vs buttons? | Drag primary, arrow buttons fallback. | Decided |
| 4 | Should offline banner be dismissible? | No — persistent while offline. | Decided |
| 5 | Should share analytics include platform? | Yes — add `platform` field to telemetry. | Decided |
| 6 | What telemetry fields for share events? | `event`, `user_id`, `content_type`, `content_id`, `share_token`, `platform`, `user_agent`, `timestamp`. | Decided |
| 7 | Does queue persist across restarts? | Yes — save `queue` + `currentIndex` together in localStorage. | Decided |
| 8 | MiniPlayer share button visibility? | Show on all screen sizes. Icon only on mobile, icon + label on desktop/landscape. | Decided |
| 9 | NowPlaying header share button? | Show in both portrait and landscape. Between dismiss chevron and center title. | Decided |

**All decisions resolved. Plan is implementation-ready.**

## Implementation Sequence

### Step 1: Backend Foundation (must complete first)
1. Create `backend/models/share.py`
2. Create `backend/routes/share.py` with `POST /generate` and `GET /{token}`
3. Add Alembic migration and run it
4. Wire into `backend/main.py`
5. Add telemetry tracking in `backend/services/telemetry.py`

### Step 2: Frontend Infrastructure (parallel with Step 1 where possible)
6. Create `web/muzix/hooks/useSharing.ts`
7. Create `web/muzix/app/share/[token].tsx` route
8. Create `web/muzix/hooks/useKeyboardShortcuts.ts`
9. Create `web/muzix/hooks/useHaptics.ts`
10. Create `web/muzix/components/EmptyStates.tsx`

### Step 3: Component Wiring (depends on Step 2)
11. Add share buttons to `SongRow.tsx`
12. Add share button to `NowPlaying.tsx`
13. Add share button to `MiniPlayer.tsx`
14. Update `album/[id].tsx` — replace `handleShare` with `useSharing`
15. Update `artist/[id].tsx` — add share button
16. Update `playlist/[id].tsx` — replace `handleShare` with `useSharing`
17. Update `search.tsx` — add share on results
18. Update `index.tsx` — add share on hero/top picks

### Step 4: Lyrics Improvements (depends on Step 2)
19. Update `LyricsPanel.tsx` — add text/image mode toggle
20. Update `LyricsImageGenerator.tsx` — add timestamp, fix web capture
21. Update `NowPlaying.tsx` — wire lyrics share through `useSharing`, add error UI

### Step 5: Queue UX (depends on Step 2)
22. Create `web/muzix/components/QueuePanel.tsx`
23. Add `moveInQueue` to `playerStore.ts`
24. Add queue icon to `MiniPlayer.tsx`
25. Add `QueuePanel` to `app/_layout.tsx`

### Step 6: Global Integration (depends on Steps 3-5)
26. Update `app/_layout.tsx` — add ErrorBoundary, offline banner, keyboard shortcuts, haptics, QueuePanel
27. Fix `catch {}` swallowers in identified files
28. Add `RefreshControl` to missing screens

### Step 7: Testing & Polish
29. Run unit tests
30. Manual E2E testing on iOS, Android, web
31. Accessibility audit
32. Performance check

## Critical Path
- Steps 1 and 2 can run in parallel
- Step 3 depends on Step 2 completion
- Step 4 depends on Step 2 completion
- Step 5 depends on Step 2 completion
- Step 6 depends on Steps 3, 4, 5 completion
- Step 7 is final validation

## Files Created
- `backend/models/share.py`
- `backend/routes/share.py`
- `web/muzix/hooks/useSharing.ts`
- `web/muzix/hooks/useKeyboardShortcuts.ts`
- `web/muzix/hooks/useHaptics.ts`
- `web/muzix/components/EmptyStates.tsx`
- `web/muzix/components/QueuePanel.tsx`
- `web/muzix/app/share/[token].tsx`

## Files Modified
- `backend/main.py`
- `backend/services/telemetry.py`
- `web/muzix/lib/colors.ts` (if any new colors needed)
- `web/muzix/app/_layout.tsx`
- `web/muzix/app/(tabs)/index.tsx`
- `web/muzix/app/(tabs)/search.tsx`
- `web/muzix/app/(tabs)/album/[id].tsx`
- `web/muzix/app/(tabs)/artist/[id].tsx`
- `web/muzix/app/(tabs)/playlist/[id].tsx`
- `web/muzix/app/(tabs)/profile.tsx`
- `web/muzix/components/SongRow.tsx`
- `web/muzix/components/MiniPlayer.tsx`
- `web/muzix/components/NowPlaying.tsx`
- `web/muzix/components/LyricsPanel.tsx`
- `web/muzix/components/LyricsImageGenerator.tsx`
- `web/muzix/store/playerStore.ts`

## Out of Scope

- Social features (follow, activity feed)
- Sleep timer, equalizer, audio effects
- Offline downloads (UI only, infra exists)
- Theme toggle (dark only for now)
- Karaoke mode
- Share analytics dashboard (backend tracking only)
