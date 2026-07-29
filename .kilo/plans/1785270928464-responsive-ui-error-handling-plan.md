# MUZIX Lyrics Sharing, Song Sharing & UX Improvements Plan

## Context
Responsive UI and accessibility work is complete. This plan covers:
1. Completing lyrics sharing (backend, analytics, error handling)
2. Implementing proper song/album/artist/playlist sharing with deep links
3. High-priority UX improvements

## Current State
- **Lyrics sharing**: Client-side only, well-built (`useLyricsSharing`, `LyricsImageGenerator`, `LyricsPanel` multi-select). Missing backend, analytics, error UI, text-only option.
- **Content sharing**: Album/playlist screens have basic `Share.share()` plain text. No song/artist sharing. No deep links. Web compatibility issues.
- **Sharing entry points**: Missing from MiniPlayer, NowPlaying header, SongRow, search results, home screen.
- **Queue UX**: No visible queue management UI.

## Key Decisions
1. **Share format**: Text + deep link URL for all content shares. Lyrics shares generate image + optional text.
2. **Backend share endpoint**: Single `/api/share` endpoint that accepts content type + ID, returns shareable URL + metadata.
3. **Share analytics**: Backend logs share events via existing telemetry system.
4. **Web sharing**: Unified `useSharing` hook that handles native share sheet and Web Share API consistently.
5. **Queue management**: Add slide-up queue panel from MiniPlayer, accessible in all orientations.

## Implementation Plan

### Phase 1: Backend Share Infrastructure (Days 1-2)

#### 1.1 Share Endpoint
Create `backend/routes/share.py`:
```python
from pydantic import BaseModel
from datetime import datetime, timedelta

class ShareRequest(BaseModel):
    content_type: str  # song, album, artist, playlist, lyrics
    content_id: str
    selected_lyrics_lines: list[int] | None = None  # For lyrics shares

class ShareResponse(BaseModel):
    share_token: str
    share_url: str
    content_type: str
    content_id: str
    expires_at: datetime | None

@router.post("/generate", response_model=ShareResponse)
async def generate_share(request: ShareRequest, user=Depends(get_current_user)):
    """Generate shareable link for songs, albums, artists, playlists, or lyrics"""
    # Validate content exists based on type
    content = await validate_content(request.content_type, request.content_id)
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")
    
    # Generate share token
    share_token = secrets.token_urlsafe(16)
    
    # Store share record
    share = Share(
        share_token=share_token,
        content_type=request.content_type,
        content_id=request.content_id,
        user_id=user.id,
        expires_at=datetime.utcnow() + timedelta(days=30),
    )
    db.add(share)
    await db.commit()
    
    # Track share event
    await track_share(user.id, request.content_type, request.content_id, share_token)
    
    base_url = os.getenv("EXPO_PUBLIC_APP_URL", "https://muzix.app")
    return ShareResponse(
        share_token=share_token,
        share_url=f"{base_url}/share/{share_token}",
        content_type=request.content_type,
        content_id=request.content_id,
        expires_at=share.expires_at,
    )

@router.get("/{share_token}")
async def get_share(share_token: str):
    """Resolve share token to content metadata"""
    share = await db.get(Share, share_token=share_token)
    if not share or (share.expires_at and share.expires_at < datetime.utcnow()):
        raise HTTPException(status_code=404, detail="Share not found or expired")
    
    content = await get_content_metadata(share.content_type, share.content_id)
    return {"content": content, "share": share}
```

#### 1.2 Share Model
Create `backend/models/share.py`:
```python
from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime, timezone

class Share(Base):
    __tablename__ = "shares"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    share_token = Column(String(32), unique=True, nullable=False, index=True)
    content_type = Column(String(50), nullable=False)  # song, album, artist, playlist, lyrics
    content_id = Column(String(255), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User", back_populates="shares")
```

Add to `backend/models/user.py`:
```python
shares = relationship("Share", back_populates="user", order_by="Share.created_at.desc()")
```

#### 1.3 Telemetry Integration
Update `backend/services/telemetry.py`:
```python
SHARE_EVENT = "share.created"

async def track_share(user_id: str, content_type: str, content_id: str, share_token: str):
    await track_event(SHARE_EVENT, {
        "user_id": user_id,
        "content_type": content_type,
        "content_id": content_id,
        "share_token": share_token,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
```

#### 1.4 Database Migration
Add migration for shares table:
```sql
CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token VARCHAR(32) UNIQUE NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    content_id VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_shares_token ON shares(share_token);
CREATE INDEX idx_shares_content ON shares(content_type, content_id);
```

### Phase 2: Unified Sharing Hook (Days 3-4)

#### 2.1 Create `useSharing` Hook
Create `web/muzix/hooks/useSharing.ts`:
```typescript
import { useState, useCallback } from 'react';
import { Share, Clipboard, Toast } from 'react-native';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/components/Toast';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";

type ContentType = 'song' | 'album' | 'artist' | 'playlist' | 'lyrics';

interface ShareOptions {
  contentType: ContentType;
  contentId: string;
  title: string;
  artist?: string;
  imageUrl?: string;
  lyrics?: string[];
  selectedLyricsLines?: number[];
}

export function useSharing() {
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const token = useAuthStore((s) => s.token);

  const generateShareLink = useCallback(async (options: ShareOptions): Promise<string> => {
    if (!token) throw new Error('Not authenticated');
    
    const res = await fetch(`${API_URL}/share/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Share failed' }));
      throw new Error(err.detail || 'Failed to generate share link');
    }

    const data = await res.json();
    return data.share_url;
  }, [token]);

  const share = useCallback(async (options: ShareOptions) => {
    setIsSharing(true);
    setShareError(null);
    
    try {
      const shareUrl = await generateShareLink(options);
      
      let message: string;
      if (options.contentType === 'lyrics' && options.selectedLyricsLines?.length) {
        const selectedText = options.selectedLyricsLines
          .map(i => options.lyrics?.[i] || '')
          .filter(Boolean)
          .join('\n');
        message = `"${selectedText}"\n\n— ${options.title} by ${options.artist}\n\nShared via MUZIX`;
      } else {
        message = `Check out "${options.title}"${options.artist ? ` by ${options.artist}` : ''} on MUZIX`;
      }

      const fullMessage = `${message}\n${shareUrl}`;

      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: options.title,
          text: message,
          url: shareUrl,
        });
      } else if (typeof Share !== 'undefined' && Share.share) {
        await Share.share({ 
          message: fullMessage,
          url: shareUrl, 
        });
      } else {
        await Clipboard.setString(fullMessage);
        toast.success('Link copied to clipboard');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Share failed';
      setShareError(errorMessage);
      toast.error(errorMessage);
      throw err;
    } finally {
      setIsSharing(false);
    }
  }, [generateShareLink]);

  const resetError = useCallback(() => setShareError(null), []);

  return { share, isSharing, shareError, generateShareLink, resetError };
}
```

#### 2.2 Wire Sharing Into Components

**SongRow** (`web/muzix/components/SongRow.tsx`):
```typescript
// Add import
import { Share2 } from 'lucide-react-native';
import { useSharing } from '@/hooks/useSharing';

// Inside component:
const { share, isSharing } = useSharing();

<Pressable
  onPress={() => share({
    contentType: 'song',
    contentId: song.id,
    title: song.title,
    artist: song.artist,
    imageUrl: song.imageUrl || undefined,
  })}
  style={{ padding: 8 }}
  hitSlop={8}
  accessibilityLabel={`Share ${song.title}`}
  accessibilityRole="button"
  disabled={isSharing}
>
  <Share2 size={18} color={TEXT_SECONDARY} />
</Pressable>
```

**NowPlaying** (`web/muzix/components/NowPlaying.tsx`):
```typescript
// Add share button in header (next to dismiss):
<Pressable
  onPress={() => share({
    contentType: 'song',
    contentId: current.id,
    title: current.title,
    artist: current.artist,
    imageUrl: current.imageUrl || undefined,
  })}
  hitSlop={8}
  accessibilityLabel="Share song"
  accessibilityRole="button"
  disabled={isSharing}
>
  <Share2 size={18} color="rgba(255,255,255,0.7)" />
</Pressable>
```

**MiniPlayer** (`web/muzix/components/MiniPlayer.tsx`):
```typescript
// Add share button (visible on desktop/landscape):
{(isDesktop || isLandscape) && (
  <Pressable
    onPress={() => share({...})}
    hitSlop={8}
    accessibilityLabel="Share song"
    accessibilityRole="button"
  >
    <Share2 size={18} color="rgba(255,255,255,0.7)" />
  </Pressable>
)}
```

**Album Detail** (`web/muzix/app/(tabs)/album/[id].tsx`):
```typescript
// Replace existing handleShare:
const { share } = useSharing();

<Pressable
  onPress={() => share({
    contentType: 'album',
    contentId: album.id,
    title: album.title,
    artist: album.artist,
    imageUrl: album.imageUrl || undefined,
  })}
  accessibilityLabel="Share album"
  accessibilityRole="button"
>
  <Share2 size={22} color={TEXT_SECONDARY} />
</Pressable>
```

**Artist Detail** (`web/muzix/app/(tabs)/artist/[id].tsx`):
```typescript
// Add share button:
const { share } = useSharing();

<Pressable
  onPress={() => share({
    contentType: 'artist',
    contentId: artist.id,
    title: artist.name,
    imageUrl: artist.imageUrl || undefined,
  })}
  accessibilityLabel="Share artist"
  accessibilityRole="button"
>
  <Share2 size={22} color={TEXT_SECONDARY} />
</Pressable>
```

**Playlist Detail** (`web/muzix/app/(tabs)/playlist/[id].tsx`):
```typescript
// Replace existing handleShare:
const { share } = useSharing();

<Pressable
  onPress={() => share({
    contentType: 'playlist',
    contentId: playlist.id,
    title: playlist.title,
  })}
  accessibilityLabel="Share playlist"
  accessibilityRole="button"
>
  <Share2 size={22} color={TEXT_SECONDARY} />
</Pressable>
```

**Search Results** (`web/muzix/app/(tabs)/search.tsx`):
```typescript
// Add share buttons to result items:
{results.songs.map((song) => (
  <SongRow 
    key={song.id} 
    song={song} 
    showShareButton 
  />
))}
{results.albums.map((album) => (
  <View style={{ position: 'absolute', top: 8, right: 8 }}>
    <Pressable onPress={() => share({...})} accessibilityLabel={`Share ${album.title}`} accessibilityRole="button">
      <Share2 size={16} color={TEXT_SECONDARY} />
    </Pressable>
  </View>
))}
```

**Home Screen** (`web/muzix/app/(tabs)/index.tsx`):
```typescript
// Add share to hero cards and top picks:
{heroAlbum && (
  <Pressable onPress={() => share({...})} accessibilityLabel={`Share ${heroAlbum.title}`} accessibilityRole="button">
    <Share2 size={20} color="rgba(255,255,255,0.7)" />
  </Pressable>
)}
{topPicks.map((song) => (
  <SongRow key={song.id} song={song} showShareButton />
))}
```

### Phase 3: Lyrics Sharing Improvements (Days 5-6)

#### 3.1 Add Error UI for Lyrics Share
Update `NowPlaying.tsx` lyrics share flow:
```typescript
const { shareError, resetError } = useLyricsSharing();

// In render, near the share preview modal trigger:
{shareError && (
  <View style={{ marginTop: 12, alignItems: 'center', paddingHorizontal: 16 }}>
    <Text style={{ color: DANGER, fontSize: 13, textAlign: 'center' }}>{shareError}</Text>
    <Pressable 
      onPress={() => { resetError(); generate(); }} 
      accessibilityLabel="Retry share" 
      accessibilityRole="button"
      style={{ marginTop: 8 }}
    >
      <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '600' }}>Retry</Text>
    </Pressable>
  </View>
)}
```

#### 3.2 Add Text-Only Share Option
Update `LyricsPanel.tsx` share mode:
```typescript
const [shareMode, setShareMode] = useState<'image' | 'text'>('image');

// Add toggle in share mode header:
<View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
  <Pressable 
    onPress={() => setShareMode('text')} 
    accessibilityLabel="Share as text" 
    accessibilityRole="button"
    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: shareMode === 'text' ? ACCENT : SURFACE_ICON }}
  >
    <Text style={{ color: shareMode === 'text' ? 'white' : TEXT_SECONDARY, fontSize: 13, fontWeight: '600' }}>Text</Text>
  </Pressable>
  <Pressable 
    onPress={() => setShareMode('image')} 
    accessibilityLabel="Share as image" 
    accessibilityRole="button"
    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: shareMode === 'image' ? ACCENT : SURFACE_ICON }}
  >
    <Text style={{ color: shareMode === 'image' ? 'white' : TEXT_SECONDARY, fontSize: 13, fontWeight: '600' }}>Image</Text>
  </Pressable>
</View>

// Update onShare callback:
const handleShare = useCallback((selectedTexts: string[]) => {
  if (shareMode === 'text') {
    onShareText(selectedTexts.join('\n'));
  } else {
    onShare(selectedTexts);
  }
}, [shareMode, onShare, onShareText]);
```

#### 3.3 Add Song Position to Share Image
Update `LyricsImageGenerator.tsx`:
```typescript
// Add timestamp prop
interface Props {
  lines: string[];
  title: string;
  artist: string;
  imageUrl?: string;
  colors: [string, string];
  currentTime?: number; // seconds
}

// In render, add timestamp display:
{currentTime && currentTime > 0 && (
  <View style={{ alignItems: 'center', marginTop: 8 }}>
    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' }}>
      {formatTime(currentTime * 1000)}
    </Text>
  </View>
)}
```

Update `NowPlaying.tsx` to pass `currentTimeSec`:
```typescript
<LyricsImageGenerator
  ref={imageRef}
  lines={selectedLyrics}
  title={current.title}
  artist={current.artist}
  imageUrl={current.imageUrl}
  colors={current.colors}
  currentTime={currentTimeSec}
/>
```

#### 3.4 Fix Web View Capture
Update `LyricsImageGenerator.tsx` for web compatibility:
```typescript
import { Platform } from 'react-native';

// Ensure view is visible for capture on web
const captureStyle = Platform.OS === 'web' 
  ? { opacity: 1, zIndex: -1, position: 'absolute' as const }
  : { left: -width - 100 };

// Use deterministic sizing for web
const containerWidth = Platform.OS === 'web' 
  ? Math.min(windowWidth * 0.9, 1080)
  : Math.min(screenW * 0.9, 1080);
```

### Phase 4: Queue UX Improvements (Days 7-8)

#### 4.1 Queue Panel Component
Create `web/muzix/components/QueuePanel.tsx`:
```typescript
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { X, Trash2, GripVertical } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '@/store/playerStore';
import { SPACING, RADIUS } from '@/lib';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { Artwork } from '@/components/Artwork';

export function QueuePanel() {
  const insets = useSafeAreaInsets();
  const { queue, currentIndex, showQueue, setShowNowPlaying, playSong, removeFromQueue, clearQueue, moveInQueue } = usePlayerStore();
  
  const [reorderIndex, setReorderIndex] = useState<number | null>(null);

  if (!showQueue) return null;

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= queue.length) return;
    moveInQueue(fromIndex, toIndex);
    setReorderIndex(null);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setShowNowPlaying(false)}>
      <Pressable 
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}
        onPress={() => setShowNowPlaying(false)}
      >
        <Pressable 
          style={{ 
            backgroundColor: BG, 
            borderTopLeftRadius: RADIUS.xl, 
            borderTopRightRadius: RADIUS.xl,
            maxHeight: '70%',
            paddingBottom: insets.bottom 
          }}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>
              Play Queue ({queue.length})
            </Text>
            <Pressable onPress={clearQueue} accessibilityLabel="Clear queue" accessibilityRole="button" hitSlop={8}>
              <Text style={{ color: ACCENT, fontSize: 14, fontWeight: '600' }}>Clear</Text>
            </Pressable>
          </View>

          {/* Queue List */}
          <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingBottom: SPACING.md }}>
            {queue.map((song, i) => (
              <Pressable
                key={song.id}
                style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  padding: SPACING.md, 
                  borderBottomWidth: 1, 
                  borderBottomColor: BORDER,
                  backgroundColor: i === currentIndex ? 'rgba(29,185,84,0.1)' : 'transparent'
                }}
                onPress={() => playSong(song, queue, i)}
                accessibilityLabel={`${i === currentIndex ? 'Now playing: ' : ''}${song.title} by ${song.artist}`}
                accessibilityRole="button"
              >
                <Text style={{ color: TEXT_MUTED, fontSize: 14, width: 24, textAlign: 'center' }}>
                  {i === currentIndex ? '▶' : i + 1}
                </Text>
                
                <Pressable 
                  hitSlop={8}
                  onPressIn={() => setReorderIndex(i)}
                  onPressOut={() => reorderIndex !== null && handleMove(reorderIndex, i)}
                  accessibilityLabel={`Drag to reorder ${song.title}`}
                  accessibilityRole="button"
                >
                  <GripVertical size={18} color={TEXT_MUTED} />
                </Pressable>
                
                <Artwork 
                  source={song.imageUrl ? { uri: song.imageUrl } : undefined} 
                  colors={song.colors} 
                  style={{ width: 40, height: 40, borderRadius: RADIUS.md, marginLeft: 8 }} 
                  radius={RADIUS.md} 
                />
                
                <View style={{ flex: 1, marginLeft: SPACING.md }}>
                  <Text style={{ color: i === currentIndex ? ACCENT : TEXT_PRIMARY, fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                    {song.title}
                  </Text>
                  <Text style={{ color: TEXT_SECONDARY, fontSize: 12 }} numberOfLines={1}>{song.artist}</Text>
                </View>
                
                <Pressable 
                  onPress={() => removeFromQueue(i)} 
                  hitSlop={8}
                  accessibilityLabel={`Remove ${song.title}`} 
                  accessibilityRole="button"
                >
                  <X size={18} color={TEXT_MUTED} />
                </Pressable>
              </Pressable>
            ))}
            
            {queue.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl }}>
                <Text style={{ color: TEXT_MUTED, fontSize: 15 }}>Queue is empty</Text>
                <Text style={{ color: TEXT_MUTED, fontSize: 13, marginTop: 4 }}>Songs will appear here as you play them</Text>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

Add `moveInQueue` to `playerStore.ts`:
```typescript
moveInQueue: (fromIndex: number, toIndex: number) => set((state) => {
  const newQueue = [...state.queue];
  const [moved] = newQueue.splice(fromIndex, 1);
  newQueue.splice(toIndex, 0, moved);
  return { queue: newQueue };
}),
```

#### 4.2 Wire Queue Panel
Update `app/_layout.tsx`:
```typescript
import { QueuePanel } from '@/components/QueuePanel';

// In render:
<View style={{ flex: 1 }}>
  <ErrorBoundary>
    <Stack screenOptions={{ headerShown: false }} />
    <MiniPlayer />
    <NowPlaying />
    <QueuePanel />
    <PlayerBridge />
  </ErrorBoundary>
</View>
```

Update `MiniPlayer.tsx`:
```typescript
const { setShowQueue } = usePlayerStore();

// Add queue button (next to play/pause):
<Pressable 
  onPress={() => setShowQueue(true)} 
  hitSlop={8}
  accessibilityLabel="View queue" 
  accessibilityRole="button"
>
  <ListMusic size={isDesktop ? 20 : 22} color="rgba(255,255,255,0.7)" />
</Pressable>
```

### Phase 5: Other UX Improvements (Days 9-10)

#### 5.1 Keyboard Shortcuts (Web/Desktop)
Create `web/muzix/hooks/useKeyboardShortcuts.ts`:
```typescript
import { useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { useAuthStore } from '@/store/authStore';

export function useKeyboardShortcuts() {
  const token = useAuthStore((s) => s.token);
  const { 
    current, isPlaying, setPlaying, next, previous, setSeekPosition, 
    volume, setVolume, toggleLike, setShowQueue 
  } = usePlayerStore();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handler = (e: KeyboardEvent) => {
      // Skip if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      
      switch (key) {
        case ' ':
        case 'spacebar':
          e.preventDefault();
          if (current) setPlaying(!isPlaying);
          break;
        case 'arrowright':
          e.preventDefault();
          if (current) setSeekPosition(Math.min(1, (current.durationMs / 1000 + 5) / (current.durationMs / 1000)));
          break;
        case 'arrowleft':
          e.preventDefault();
          if (current) setSeekPosition(Math.max(0, (current.durationMs / 1000 - 5) / (current.durationMs / 1000)));
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(Math.min(1, volume + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(Math.max(0, volume - 0.1));
          break;
        case 'n':
        case 'n':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            next();
          }
          break;
        case 'p':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            previous();
          }
          break;
        case 'l':
          if (!e.metaKey && !e.ctrlKey && current) {
            e.preventDefault();
            toggleLike(current.id);
          }
          break;
        case 'q':
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            setShowQueue(true);
          }
          break;
        case 'escape':
          // Close modals/NowPlaying
          usePlayerStore.getState().setShowNowPlaying(false);
          usePlayerStore.getState().setShowQueue(false);
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, isPlaying, volume, token]);

  // Show shortcut hint in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Keyboard shortcuts: Space=Play/Pause, ←→=Seek, ↑↓=Volume, N/P=Next/Prev, L=Like, Q=Queue, Esc=Close');
  }
}
```

Wire into `app/_layout.tsx`:
```typescript
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function RootLayout() {
  // ... existing code
  
  // Enable keyboard shortcuts only on web/desktop
  if (Platform.OS === 'web' || Platform.OS === 'windows' || Platform.OS === 'macos') {
    useKeyboardShortcuts();
  }
  
  // ... rest of render
}
```

#### 5.2 Improved Empty States
Create `web/muzix/components/EmptyStates.tsx`:
```typescript
export function EmptyLibrary() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl, paddingHorizontal: SPACING.xl }}>
      <Music size={56} color={TEXT_MUTED} strokeWidth={1.5} />
      <Text style={{ marginTop: SPACING.xxl, textAlign: 'center', fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>
        Your library is empty
      </Text>
      <Text style={{ marginTop: SPACING.sm, textAlign: 'center', fontSize: 14, color: TEXT_MUTED }}>
        Albums, artists, and playlists you save will appear here.
      </Text>
    </View>
  );
}

export function EmptyQueue() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl, paddingHorizontal: SPACING.xl }}>
      <ListMusic size={56} color={TEXT_MUTED} strokeWidth={1.5} />
      <Text style={{ marginTop: SPACING.xxl, textAlign: 'center', fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>
        Queue is empty
      </Text>
      <Text style={{ marginTop: SPACING.sm, textAlign: 'center', fontSize: 14, color: TEXT_MUTED }}>
        Songs will appear here as you play them
      </Text>
    </View>
  );
}

export function NoNetwork({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl, paddingHorizontal: SPACING.xl }}>
      <WifiOff size={56} color={TEXT_MUTED} strokeWidth={1.5} />
      <Text style={{ marginTop: SPACING.xxl, textAlign: 'center', fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>
        You're offline
      </Text>
      <Text style={{ marginTop: SPACING.sm, textAlign: 'center', fontSize: 14, color: TEXT_MUTED }}>
        Check your connection and try again
      </Text>
      <Pressable 
        onPress={onRetry}
        style={{ marginTop: SPACING.xl, backgroundColor: ACCENT, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md }}
        accessibilityLabel="Retry"
        accessibilityRole="button"
      >
        <Text style={{ color: 'white', fontSize: 15, fontWeight: '600' }}>Retry</Text>
      </Pressable>
    </View>
  );
}
```

#### 5.3 Pull-to-Refresh Everywhere
Add RefreshControl to screens missing it:

**Album/[id].tsx**:
```typescript
const [refreshing, setRefreshing] = useState(false);
const { data, refetch } = useAlbum(id);

const onRefresh = useCallback(async () => {
  setRefreshing(true);
  await refetch();
  setRefreshing(false);
}, [refetch]);

<ScrollView
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
>
```

**Artist/[id].tsx**: Same pattern with `useArtist(id)`.

**Playlist/[id].tsx**: Same pattern with `usePlaylist(id)`.

**Profile.tsx**: Add `reloadAll` to refresh profile data.

#### 5.4 Haptic Feedback
Create `web/muzix/hooks/useHaptics.ts`:
```typescript
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function useHaptics() {
  const impact = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS === 'web') return;
    Haptics.impactAsync(style);
  };

  const notification = (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS === 'web') return;
    Haptics.notificationAsync(type);
  };

  return { impact, notification };
}
```

Usage in components:
```typescript
const { impact, notification } = useHaptics();

const handleLike = () => {
  impact(Haptics.ImpactFeedbackStyle.Medium);
  toggleLike(current.id);
};

const handlePlay = () => {
  impact(Haptics.ImpactFeedbackStyle.Light);
  setPlaying(!isPlaying);
};

const handleError = () => {
  notification(Haptics.NotificationFeedbackType.Error);
};
```

#### 5.5 Offline Indicators
Update `app/_layout.tsx`:
```typescript
import { useConnectivity } from '@/hooks/useConnectivity';

export default function RootLayout() {
  const isOnline = useConnectivity();
  
  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <ToastProvider>
        <ThemeProvider value={NAV_THEME[(colorScheme ?? 'light') as 'light' | 'dark']}>
          <StatusBar style="light" />
          <View style={{ flex: 1 }}>
            {!isOnline && (
              <View style={{ backgroundColor: DANGER, paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' }}>
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>
                  You're offline — some features may be limited
                </Text>
              </View>
            )}
            <ErrorBoundary>
              <Stack screenOptions={{ headerShown: false }} />
              <MiniPlayer />
              <NowPlaying />
              <QueuePanel />
              <PlayerBridge />
            </ErrorBoundary>
          </View>
        </ThemeProvider>
      </ToastProvider>
    </TamaguiProvider>
  );
}
```

### Phase 2: Unified Sharing Hook (Days 3-4)

#### 2.1 Create `useSharing` Hook
Create `web/muzix/hooks/useSharing.ts`:
```typescript
type ContentType = 'song' | 'album' | 'artist' | 'playlist' | 'lyrics';

interface ShareOptions {
  contentType: ContentType;
  contentId: string;
  title: string;
  artist?: string;
  imageUrl?: string;
  lyrics?: string[];
  selectedLyricsLines?: number[];
}

export function useSharing() {
  const [isSharing, setIsSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const token = useAuthStore(s => s.token);

  const generateShareLink = async (options: ShareOptions): Promise<string> => {
    const res = await fetch(`${API_URL}/share/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    });
    if (!res.ok) throw new Error('Failed to generate share link');
    const data = await res.json();
    return data.share_url;
  };

  const share = async (options: ShareOptions) => {
    setIsSharing(true);
    setShareError(null);
    try {
      const shareUrl = await generateShareLink(options);
      const message = options.lyrics && options.selectedLyricsLines?.length 
        ? `Lyrics from "${options.title}" by ${options.artist} on MUZIX`
        : `Check out "${options.title}"${options.artist ? ` by ${options.artist}` : ''} on MUZIX: ${shareUrl}`;

      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: options.title,
          text: message,
          url: shareUrl,
        });
      } else if (typeof Share !== 'undefined') {
        await Share.share({ message: `${message}\n${shareUrl}` });
      } else {
        // Fallback: copy to clipboard
        await Clipboard.setString(`${message}\n${shareUrl}`);
        toast.success('Link copied to clipboard');
      }
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Share failed');
      throw err;
    } finally {
      setIsSharing(false);
    }
  };

  return { share, isSharing, shareError, generateShareLink };
}
```

#### 2.2 Wire Sharing Into Components
Add share buttons to:
- `SongRow.tsx` — add Share2 icon button
- `NowPlaying.tsx` — add share button in header (next to dismiss)
- `MiniPlayer.tsx` — add share button (visible in desktop/landscape)
- `album/[id].tsx` — replace existing `handleShare` with `useSharing`
- `artist/[id].tsx` — add share button
- `playlist/[id].tsx` — replace existing `handleShare` with `useSharing`
- `search.tsx` — add share on song/album/artist results
- `index.tsx` — add share on hero cards and top picks

### Phase 3: Lyrics Sharing Improvements (Days 5-6)

#### 3.1 Add Error UI for Lyrics Share
Update `NowPlaying.tsx` lyrics share flow:
```typescript
const { shareError } = useLyricsSharing();

// In render:
{shareError && (
  <View style={{ marginTop: 12, alignItems: 'center' }}>
    <Text style={{ color: DANGER, fontSize: 13 }}>{shareError}</Text>
    <Pressable onPress={() => generate()} accessibilityLabel="Retry share" accessibilityRole="button">
      <Text style={{ color: ACCENT, fontSize: 13, fontWeight: '600', marginTop: 4 }}>Retry</Text>
    </Pressable>
  </View>
)}
```

#### 3.2 Add Text-Only Share Option
Update `LyricsPanel.tsx` share mode:
```typescript
const [shareMode, setShareMode] = useState<'image' | 'text'>('image');

// In share button toolbar:
<Pressable onPress={() => setShareMode('text')} accessibilityLabel="Share as text" accessibilityRole="button">
  <Text style={{ color: shareMode === 'text' ? ACCENT : TEXT_SECONDARY }}>Text</Text>
</Pressable>
<Pressable onPress={() => setShareMode('image')} accessibilityLabel="Share as image" accessibilityRole="button">
  <ImageIcon size={18} color={shareMode === 'image' ? ACCENT : TEXT_SECONDARY} />
</Pressable>

// When shareMode === 'text', call:
onShareText(selectedLines.map(l => l.text).join('\n'));
```

#### 3.3 Add Song Position to Share Image
Update `LyricsImageGenerator.tsx`:
```typescript
// Add timestamp display if currentTime > 0
{currentTime && (
  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
    {formatTime(currentTime)}
  </Text>
)}
```

#### 3.4 Fix Web View Capture
Ensure `LyricsImageGenerator` renders correctly for `react-native-view-shot` on web:
- Use `expo-web-browser` compatible rendering
- Test with complex gradients and album artwork
- Add fallback for browsers that block off-screen capture

### Phase 4: Queue UX Improvements (Days 7-8)

#### 4.1 Queue Panel Component
Create `web/muzix/components/QueuePanel.tsx`:
```typescript
export function QueuePanel() {
  const { queue, currentIndex, showQueue, setShowQueue, playSong, removeFromQueue, clearQueue } = usePlayerStore();
  const insets = useSafeAreaInsets();

  if (!showQueue) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => setShowQueue(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
        <View style={{ 
          backgroundColor: SURFACE_ELEVATED, 
          borderTopLeftRadius: RADIUS.xl, 
          borderTopRightRadius: RADIUS.xl,
          maxHeight: '70%',
          paddingBottom: insets.bottom 
        }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>Play Queue</Text>
            <Pressable onPress={clearQueue} accessibilityLabel="Clear queue" accessibilityRole="button">
              <Text style={{ color: ACCENT, fontSize: 14, fontWeight: '600' }}>Clear</Text>
            </Pressable>
          </View>
          
          <ScrollView style={{ maxHeight: 400 }}>
            {queue.map((song, i) => (
              <View key={song.id} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                <Text style={{ color: TEXT_MUTED, fontSize: 14, width: 24 }}>{i + 1}</Text>
                <Artwork source={song.imageUrl ? { uri: song.imageUrl } : undefined} colors={song.colors} style={{ width: 40, height: 40, borderRadius: 8 }} radius={8} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: i === currentIndex ? ACCENT : TEXT_PRIMARY, fontSize: 14, fontWeight: '500' }}>{song.title}</Text>
                  <Text style={{ color: TEXT_SECONDARY, fontSize: 12 }}>{song.artist}</Text>
                </View>
                {i === currentIndex && (
                  <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '600' }}>Playing</Text>
                )}
                <Pressable onPress={() => removeFromQueue(i)} accessibilityLabel={`Remove ${song.title}`} accessibilityRole="button">
                  <X size={18} color={TEXT_MUTED} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
```

#### 4.2 Wire Queue Panel
Update `app/_layout.tsx`:
```typescript
import { QueuePanel } from '@/components/QueuePanel';

// In render:
<View style={{ flex: 1 }}>
  <ErrorBoundary>
    <Stack />
    <MiniPlayer />
    <NowPlaying />
    <QueuePanel />
    <PlayerBridge />
  </ErrorBoundary>
</View>
```

Update `MiniPlayer.tsx`:
- Long press or swipe up opens `QueuePanel`
- Add queue icon button next to play/pause

### Phase 5: Other UX Improvements (Days 9-10)

#### 5.1 Keyboard Shortcuts (Web/Desktop)
Add keyboard shortcuts for web/desktop:
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    
    switch (e.key) {
      case ' ':
      case 'Space':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        e.preventDefault();
        seek(currentTimeSec + 5);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        seek(currentTimeSec - 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setVolume(Math.min(1, volume + 0.1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setVolume(Math.max(0, volume - 0.1));
        break;
      case 'n':
      case 'N':
        next();
        break;
      case 'p':
      case 'P':
        previous();
        break;
      case 'l':
      case 'L':
        toggleLike(current.id);
        break;
    }
  };
  
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, [current, volume, currentTimeSec]);
```

#### 5.2 Improved Empty States
Add consistent empty state components:
- `EmptyLibrary.tsx` — for when library has no content
- `EmptyQueue.tsx` — for empty queue
- `EmptySearch.tsx` — already exists, enhance with suggestions
- `NoNetwork.tsx` — for offline state with retry button

#### 5.3 Pull-to-Refresh Everywhere
Ensure all screens have pull-to-refresh:
- [x] Home — already has
- [x] Search — already has
- [x] Library — already has
- [ ] Album/[id] — add RefreshControl
- [ ] Artist/[id] — add RefreshControl
- [ ] Playlist/[id] — add RefreshControl
- [ ] Profile — add RefreshControl

#### 5.4 Haptic Feedback
Add haptic feedback for key interactions:
```typescript
import * as Haptics from 'expo-haptics';

// On button press:
const handlePress = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  // ... action
};

// On like:
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// On error:
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
```

#### 5.5 Offline Indicators
Show persistent offline banner when network is unavailable:
```typescript
const isOnline = useConnectivity();

return (
  <View style={{ flex: 1 }}>
    {!isOnline && (
      <View style={{ backgroundColor: DANGER, padding: 8, alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>You're offline — some features may be limited</Text>
      </View>
    )}
    {/* ... rest of app */}
  </View>
);
```

## Success Criteria

### Sharing
- [ ] All content types (song, album, artist, playlist, lyrics) have share buttons
- [ ] Shares generate deep link URLs that resolve to correct content
- [ ] Share works on web, iOS, Android
- [ ] Share analytics tracked in backend
- [ ] Lyrics share has both image and text options
- [ ] Share errors shown to user with retry option

### Queue UX
- [ ] Queue panel accessible from MiniPlayer
- [ ] Can reorder, remove, clear queue
- [ ] Current track highlighted in queue
- [ ] Queue persists across app restarts

### Other UX
- [ ] Keyboard shortcuts work on web/desktop
- [ ] Haptic feedback on key interactions
- [ ] Offline banner shown when disconnected
- [ ] All screens have pull-to-refresh
- [ ] Consistent empty states across app

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Web Share API not supported in some browsers | Medium | Low | Fallback to clipboard copy |
| Deep links not configured for app | Low | High | Use web URLs as fallback; configure app links later |
| Share token leakage | Low | Medium | Short expiry (7 days), rate limit generation |
| Queue panel performance with large queues | Medium | Medium | Virtualize list if >50 items |
| Keyboard shortcuts conflict with browser | Medium | Low | Check `e.target` is not input; use modifier keys optionally |

## Out of Scope
- Social features (follow, activity feed)
- Sleep timer
- Equalizer/audio effects
- Offline downloads (infrastructure exists, no UI)
- Theme toggle (dark theme only for now)
- Karaoke mode
