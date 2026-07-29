# Lyrics Sharing Feature Implementation Plan

## Goal
Add lyrics sharing feature similar to Spotify/Amazon Music with share icon, customizable lyric selection, image generation, and branding (MUZIX, song name, artist, thumbnail).

## Scope
- Add share icon to lyrics panel
- Implement lyric line selection interface
- Create image generation for selected lyrics
- Include MUZIX branding and song metadata
- Integrate with thumbnail API for album artwork
- Share generated images via system share sheet

## Constraints
### Technical
- React Native Expo 56 environment
- Dependencies: `expo-view-shot`, `expo-sharing` needed
- Must maintain existing lyrics functionality
- Image generation must work both on-device and for sharing
- Must handle cases with no artwork/lyrics

### UI/UX
- Share icon should appear in lyrics panel header
- Selection UI must allow tap-to-select/deselect lines
- Image generation must render properly over artwork/gradient
- Branded with MUZIX logo/text, song title, artist name
- Must work across different device sizes

### Data Flow
- Modified `LyricsPanel` component to include share functionality
- Selection state management for highlighted lines
- Image generation using captured views/sharing APIs
- Integration with existing artwork and metadata services

## Current Implementation
- `LyricsPanel.tsx` handles LRC/plain text lyric parsing and display
- Integrated in `NowPlaying.tsx` within GlassCard
- Song model includes `lyrics` field in `Song` interface
- Artwork component available for thumbnail rendering

## Key Decisions
1. **Share Icon Placement**: Add share icon to `LyricsPanel` header
2. **Selection Mechanism**: Tap-to-select/deselect lines with visual indicator
3. **Image Generation Approach**: Use `expo-view-shot` to capture custom view as image
4. **Sharing Implementation**: Use `expo-sharing` for system share sheet
5. **Branding**: Use placeholder MUZIX logo/text in generated images
6. **Background**: Use artwork thumbnail or gradient fallback
7. **Text Styling**: Large readable lyrics text with subtle shadow/outline

## UI Workflow Design
1. **Trigger**: User taps share icon in lyrics panel
2. **Selection**: Display selection interface allowing line selection/deselection
3. **Generator**: Create image with selected lyrics over artwork background
4. **Share**: Show system share sheet with options to save/share
5. **Feedback**: Visual confirmation after sharing

## Component Plan
### 1. LyricsPanel Enhancement (`LyricsPanel.tsx`)
- Add share icon button to header
- Manage selection state for lyric lines
- Handle line tap selection/deselection

### 2. Selection Interface Component (`LyricsSelection.tsx`)
- Display checklist of lyric lines
- Allow multi-select/deselect
- Confirm/cancel buttons

### 3. Image Generation Component (`LyricsImageGenerator.tsx`)
- Accept selected lyrics lines as input
- Render image with:
  - Background: Song artwork/thumbnail or gradient
  - Overlay: Selected lyrics text with proper styling
  - Top: MUZIX branding text
  - Bottom: Song title and artist
- Export/share capability

### 4. Share Service Wrapper (`useLyricsSharing.ts`)
- Handle image generation and sharing workflow
- Manage dependencies (`expo-view-shot`, `expo-sharing`)
- Provide error handling and fallbacks

## Data Flow Diagram
```
UserInteraction → LyricsPanel (share button) → SelectionModal → 
LyricsImageGenerator.generate() → expo-view-shot.capture() → 
expo-sharing.share() → System Share Sheet
```

## Dependencies to Add
```json
// package.json additions
"expo-view-shot": "~56.0.0",
"expo-sharing": "~56.0.0"
```

## Image Generation Requirements
1. **Background**: 
   - Use `Artwork` component to render song thumbnail
   - Apply blur/gradient effects if needed
2. **Text Layout**:
   - Selected lyrics: Large, centered, white with subtle shadow
   - Song title: Medium size, bold, bottom center
   - Artist: Small size, medium weight
   - MUZIX branding: Top center, prominent
3. **Styling**:
   - Gradient overlay for text readability
   - Consistent padding/margins
   - Responsive layout for different screen sizes

## Edge Cases to Handle
- **No lyrics available**: Show fallback message, disable share
- **Long lyrics**: Automatically scroll/view more
- **No artwork**: Use gradient background with primary colors
- **Empty selection**: Allow sharing current view or disable button
- **Single/multiple lines**: Support various selection combinations
- **Image capture errors**: Fallback to screenshot or disable sharing

## Validation Steps
1. Verify share icon appears correctly in lyrics panel
2. Test lyric line selection functionality
3. Validate image generation with various selection states
4. Confirm sharing works with iOS/Android share sheets
5. Test error handling for missing dependencies
6. Validate responsive design across device sizes

## Migration Path
1. Add new dependencies to `package.json` and install
2. Modify `LyricsPanel.tsx` to include share button
3. Create new components for selection and image generation
4. Integrate image generation and sharing workflow
5. Update styling to accommodate new elements
6. Test thoroughly with existing functionality preserved

## Open Questions / Decisions
1. Should selection interface be a separate screen or modal?
2. How should we handle long lyric selections requiring scrolling?
3. What's the optimal text styling for readability over various backgrounds?
4. Should we support exporting to camera roll in addition to sharing?
5. How should we handle cases where no artwork is available?

(End of file - total 78 lines)