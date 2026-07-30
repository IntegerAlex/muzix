# Plan: Finalize GlassCard Path A (Translucent Android Fallback)

## Goal
Lock in the current translucent Android fallback as the production approach, fix the remaining visual/accessibility gaps, and validate on real devices.

## Current State
- `GlassCard.tsx` supports `variant="glass"` with `BlurView` + `GLASS_BLUE_TINT` overlay
- Android uses `blurMethod="none"` (translucent fallback, no real blur)
- iOS/Web get real blur via `expo-blur`
- 3 call sites use `variant="glass"`: MiniPlayer, NowPlaying Up Next, NowPlaying Lyrics
- 7 call sites remain `variant="elevated"` (solid): album/artist/playlist screens
- Tests pass, no TS errors

## Open Questions

### 1. Android glass visual target
With `blurMethod="none"`, `expo-blur` renders a semi-transparent surface, but the exact default appearance varies by library version. What should the Android glass variant look like when there is no real blur?

- **Option A (current):** Pure translucent — `GLASS_BLUE_TINT` overlay only, orbs visible through faint blue wash, no additional darkening
- **Option B:** Dark translucent — add `backgroundColor: 'rgba(0,0,0,0.25)'` to the BlurView on Android only, so orbs show through a darker blue-tinted pane that reads as "glass" rather than "barely-tinted air"
- **Option C:** Drop translucency entirely — render as solid `SURFACE_ELEVATED` on Android, but add a subtle blue left-border or top-accent to hint at the glass variant

**Recommendation:** Option B. Without blur, pure translucency (Option A) is visually meaningless — it looks like a faint tint overlay on top of the same content. Adding a dark base makes the glass card feel like a distinct surface while still letting orbs bleed through slightly.

### 2. Shadow on translucent Android surface
Should shadow/elevation apply on Android where the surface is translucent?

- **Yes:** Shadow adds depth cue even on translucent surfaces
- **No:** Shadow on translucent glass looks muddy because it falls on the blurred/translucent content behind it, not on a solid background

**Recommendation:** Yes, but use a tighter shadow (`shadowRadius: 8`, `shadowOpacity: 0.3`) on Android. iOS can use the full planned shadow. The shadow will be subtle enough to not look muddy on the dark AnimatedBackdrop background.

### 3. Reduce Transparency fallback behavior
When `reduceTransparency` is enabled, should we render the solid `elevated` variant, or a semi-transparent solid with the blue tint?

- **Option 1:** Full solid `SURFACE_ELEVATED` — matches iOS native behavior most closely
- **Option 2:** Solid with blue accent — `backgroundColor: SURFACE_ELEVATED` plus a 2px blue left border to preserve visual identity

**Recommendation:** Option 1. iOS replaces blur with a solid material; matching that behavior is more predictable and accessible.

## Proposed Changes

### 1. Add shadow/elevation to glass variant
- Add `shadowColor: 'black'`, `shadowOffset: { width: 0, height: 4 }`, `shadowOpacity: 0.3`, `shadowRadius: 8`, `elevation: 8` to the outer View when `variant === "glass"`
- On Android, use tighter values: `shadowOpacity: 0.2`, `shadowRadius: 6`, `elevation: 6`
- This makes the glass card feel elevated above the backdrop

### 2. Add Reduce Transparency accessibility fallback
- Import `AccessibilityInfo` and `useEffect` in `GlassCard.tsx`
- Add `reduceTransparency` state, listen to `isReduceTransparencyEnabled` changes
- When `reduceTransparency` is true AND `variant === "glass"`, render the `elevated` variant instead (solid `SURFACE_ELEVATED` background)
- This matches iOS native behavior and ensures readability

### 3. Increase Android fallback opacity (Option B from Q1)
- Keep `GLASS_BLUE_TINT = 'rgba(30, 80, 200, 0.10)'` as the iOS/Web overlay
- On Android only, add `backgroundColor: 'rgba(0,0,0,0.25)'` to the BlurView style, so the fallback reads as dark translucent glass rather than a faint blue wash
- The blue tint overlay still applies on top, so the final Android glass is: dark translucent base + blue tint + content

### 4. Verify on real devices
- Test on Android physical device (API 31+) — confirm no crash, dark translucent blue panel visible over AnimatedBackdrop orbs
- Test on iOS — confirm real frosted glass with orbs visible through blue tint
- Test on Web — confirm CSS backdrop-filter blur works
- Verify text contrast on glass variant (white text on dark translucent blue — should be > 4.5:1)
- Test with Reduce Transparency enabled — should render solid `SURFACE_ELEVATED` card on all platforms
- Test with Reduced Motion enabled — AnimatedBackdrop orbs freeze, but glass card should still render correctly

## Out of Scope
- Real Android blur via `@sbaiahmed1/react-native-blur` (requires dev build, separate plan)
- Genre-based UI (separate plan)
- Sleep timer, equalizer, offline downloads (separate plans)

## Validation
1. Run `npx tsc --noEmit` — zero new errors
2. Run `npx jest` — all GlassCard tests pass
3. Visual check on Android/iOS/Web as above
4. Accessibility check with Reduce Transparency + Reduced Motion enabled
