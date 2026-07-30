# Muzix Design System

## Philosophy

Dark-first, glass-forward. The visual language is rooted in Apple's Liquid Glass aesthetic reinterpreted for cross-platform: frosted translucency on iOS/Web, dark translucent fallback on Android. Every surface is either elevated solid or frosted glass — nothing flat, nothing bare. Color is used sparingly to accent, never to decorate.

## Color Palette

### Base (dark mode only — no light mode)
| Token | Value | Usage |
|---|---|---|
| `BG` | `#0a0a0a` | Page background |
| `SURFACE` | `#121212` | Secondary surfaces |
| `SURFACE_ELEVATED` | `#1a1a1a` | Card backgrounds (elevated variant), reduce-transparency fallback |
| `SURFACE_ICON` | `#242424` | Icon button circular backgrounds |
| `CARD_BG` | `rgba(18,18,18,0.85)` | Defined but unused; `SURFACE_ELEVATED` is used instead |

### Text
| Token | Value | Usage |
|---|---|---|
| `TEXT_PRIMARY` | `white` | Primary content, `#ffffff` |
| `TEXT_SECONDARY` | `rgba(255,255,255,0.55)` | Secondary labels |
| `TEXT_MUTED` | `rgba(255,255,255,0.45)` | Captions, timestamps, metadata |

### Accent & Feedback
| Token | Value | Usage |
|---|---|---|
| `ACCENT` | `#1DB954` | Spotify-green for active states, play buttons, toggled icons |
| `DANGER` | `#f43f5e` | Destructive actions, errors |
| `BORDER` | `rgba(255,255,255,0.15)` | All borders and dividers |

### Glass Tokens
| Token | Value | Usage |
|---|---|---|
| `GLASS_BLUE_TINT` | `rgba(30, 80, 200, 0.10)` | Blue-tinted overlay on glass variant (all platforms) |
| `GLASS_ANDROID_DARK_BASE` | `rgba(0,0,0,0.25)` | Dark base beneath BlurView on Android (`blurMethod="none"`) |

### Input
| Token | Value | Usage |
|---|---|---|
| `INPUT_BG` | `rgba(255,255,255,0.05)` | Text input background |
| `INPUT_BORDER` | `rgba(255,255,255,0.18)` | Input border (resting) |
| `INPUT_BORDER_FOCUS` | `rgba(29,185,84,0.5)` | Input border (focused) |

## Typography

Using Tamagui's `Text` component with system fonts (SF Pro on iOS, Roboto on Android, system-ui on Web). No custom font file. Font weight values: `400` default, `500` medium, `600` semibold, `700` bold. Applied via `fontWeight` prop on Tamagui `<Text>`.

Common patterns:
- **Card headers:** `fontSize={11} fontWeight="600" textTransform="uppercase" letterSpacing={0.5}` in `TEXT_MUTED`
- **Song/album titles:** `fontSize={13–17} fontWeight="600"` in `TEXT_PRIMARY`, `numberOfLines={1}`
- **Artist name / metadata:** `fontSize={11–13} fontWeight="500"` in `TEXT_SECONDARY`
- **Large display:** `fontSize={28} fontWeight="700" letterSpacing={-0.6}` for time in weather card

## Spacing

```ts
const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
```

Applied consistently: section margins use `SPACING.xxl` horizontally, card padding uses `SPACING.md`–`SPACING.lg`, gaps between elements use `SPACING.sm`.

## Radius & Borders

```ts
const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
```

Every card, button, and surface uses rounded corners. Default GlassCard radius is `RADIUS.xl` (20). Icon buttons use `borderRadius: 22` (circular at 44×44). Artwork thumbnails typically `radius={8}`. All borders use `borderWidth: 1, borderColor: BORDER`.

## GlassCard Component

The core surface primitive. Two variants:

### `variant="elevated"` (default)
Solid `SURFACE_ELEVATED` background with `BORDER` stroke. Used for album/artist/playlist detail pages — content-heavy screens where blur over content would degrade readability.

### `variant="glass"`
Frosted glass surface with shadow:
1. Outer wrapper applies platform shadow (`elevation: 6` Android, `shadowColor/Offset/Opacity/Radius` iOS/Web)
2. Clipping wrapper (`overflow: hidden`, `borderRadius: radius`)
3. `BlurView` with `tint="dark"`, configurable `intensity` (default 40)
4. `GLASS_BLUE_TINT` overlay (`rgba(30, 80, 200, 0.10)`), absolute, `pointerEvents="none"`
5. Border overlay (absolute, `pointerEvents="none"`, `borderWidth: 1, borderColor: BORDER`)
6. On Android, `BlurView` style includes `backgroundColor: GLASS_ANDROID_DARK_BASE` (`rgba(0,0,0,0.25)`)

Applied to navigation-layer surfaces: MiniPlayer (`intensity={50}`), NowPlaying Up Next (`intensity={30}`), NowPlaying lyrics (`intensity={20}`).

### Platform differences

| Feature | iOS | Android | Web |
|---|---|---|---|
| Blur | Real `BlurView` blur | `blurMethod="none"` (translucent + dark base) | CSS `backdrop-filter` |
| Dark base | None (real blur handles it) | `GLASS_ANDROID_DARK_BASE` (`rgba(0,0,0,0.25)`) | None |
| Shadow | `shadowColor/Offset/Opacity/Radius` | `elevation: 6` | `shadowColor/Offset/Opacity/Radius` |
| Reduce Transparency | Handled natively by iOS `UIVisualEffectView` | JS-side fallback to solid `SURFACE_ELEVATED` | JS-side fallback to solid |

### Reduce Transparency
On Android/Web, `AccessibilityInfo` listener detects `reduceTransparencyEnabled`. When active, `variant="glass"` renders as solid `SURFACE_ELEVATED`. iOS `BlurView` handles this natively; no JS-side check is performed on iOS.

### Android constraint
Current implementation uses `blurMethod="none"` to avoid the "Software rendering doesn't support hardware bitmaps" crash. If real Android blur is desired in the future, the component must be refactored to use `BlurTargetView` + `blurMethod="dimezisBlurViewSdk31Plus"`, which requires a dev build (Expo Go does not support the native module).

## Icons

All icons sourced from [HugeIcons Free](https://hugeicons.com) (Stroke Rounded style, 5400+ icons). Rendered via `@hugeicons/react` `HugeiconsIcon` component wrapped in `createIcon()` factory at `lib/icons.tsx` for lucide-compatible props (`{ size, color, strokeWidth }`).

Used as: `<Icon size={18} color={TEXT_MUTED} />` across 56 exported icons. Icon button circular backgrounds use `SURFACE_ICON` (`#242424`). Mood display uses dedicated face icons:

| Mood | Icon | Color |
|---|---|---|
| Happy | HappyIcon | `#f59e0b` |
| Energetic | Grinning | `#ec4899`/#f97316/#06b6d4/#3b82f6 |
| Intense / Rebellious | Angry | `#ef4444`/#dc2626/#e11d48 |
| Relaxed / Chill / Easy | Relieved | `#8b5cf6`/#84cc16/#eab308 |
| Soulful / Confident / Gentle | Smile | `#6366f1`/#14b8a6/#10b981/#22c55e |
| Calm | Neutral | `#a855f7`/#6366f1 |
| Smooth / Creative | Wink | `#f43f5e`/#a855f7 |
| Thoughtful | Pensive | `#7c3aed` |
| Passionate | Kissing | `#ef4444` |

## Animation

Using `react-native-reanimated` for all animation work.

### Backdrop
`AnimatedBackdrop` renders two large circular orbs that slowly cycle through purple→blue and pink→cyan (`interpolateColor` over 12s, `withRepeat(-1, true)`). Respects `reduceMotionEnabled` — freezes at endpoint when active. Rendered `pointerEvents="none"` behind all content.

### MiniPlayer
Slides up with `withSpring` (damping 18, stiffness 200, mass 0.8) when a song starts, slides down with `withTiming` (200ms, `Easing.out(Easing.quad)`) when NowPlaying opens. Progress bar uses `withTiming` linear over `current.durationMs`.

### Orbs
The animated backdrop orbs are pure software rendering (no image assets). On reduced motion, they freeze at the end color state rather than disappearing.

## Layout

### Responsive breakpoints (`useResponsive`)
- **Mobile:** `<768px` — single column, bottom tab bar
- **Tablet:** `768–1024px` — optional sidebar
- **Desktop:** `>=1024px` — MiniPlayer renders horizontal layout with Shuffle/Skip/Play controls inline

### Page structure
All pages share the `AnimatedBackdrop` as root background. Content scrolls over it. Bottom tab bar is always present (except full-screen NowPlaying). MiniPlayer sits above tab bar when a song is active.

## Accessibility

- All `Pressable` elements have `accessibilityLabel` and `accessibilityRole="button"`
- Buttons use minimum 44×44pt touch targets (WCAG)
- `hitSlop={8}` on smaller targets
- GlassCard Reduce Transparency fallback on Android/Web
- AnimatedBackdrop Reduce Motion freeze
- Color contrast: white text on `SURFACE_ELEVATED` (#1a1a1a) and glass surfaces exceeds 4.5:1

## Design Principles

1. **Glass only on navigation layers.** MiniPlayer, NowPlaying cards — surfaces the user interacts with over content. Detail pages (albums, artists, playlists) remain solid to avoid blur-over-content degradation.
2. **One accent color.** `ACCENT` (#1DB954) is the only interactive color. Mood icons use varied colors but never compete with accent.
3. **Borders define surfaces.** Every card, sheet, and panel has a `BORDER` stroke to separate it from the dark background and the animated orbs behind.
4. **Dark mode only.** No light mode. The app is designed for music consumption in low-light environments.
5. **No raster assets for UI chrome.** AnimatedBackdrop orbs are rendered via Reanimated. All icons are vector HugeIcons. Content images (album artwork) are loaded via `expo-image`; no PNG/JPEG files are bundled for interface elements.
