import { useMemo, useState, memo, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface ArtworkProps {
  source?: { uri: string } | number;
  colors?: [string, string];
  style?: StyleProp<ImageStyle>;
  radius?: number;
  accessible?: boolean;
}

function mixColor(a: string, b: string): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const r = Math.round((r1 + r2) / 2);
  const g = Math.round((g1 + g2) / 2);
  const bl = Math.round((b1 + b2) / 2);
  return `rgb(${r},${g},${bl})`;
}

function areEqual(prev: ArtworkProps, next: ArtworkProps) {
  if (prev.radius !== next.radius) return false;
  const ps = prev.source && typeof prev.source === 'object' ? prev.source.uri : prev.source;
  const ns = next.source && typeof next.source === 'object' ? next.source.uri : next.source;
  if (ps !== ns) return false;
  if (prev.colors?.[0] !== next.colors?.[0] || prev.colors?.[1] !== next.colors?.[1]) return false;
  if ((prev.accessible ?? false) !== (next.accessible ?? false)) return false;
  return true;
}

export const Artwork = memo(function Artwork({ source, colors, style, radius = 12, accessible }: ArtworkProps) {
  const uri = source && typeof source === 'object' ? source.uri : undefined;
  // Error state is keyed by uri: without this a failed load latches the
  // gradient for every later track that reuses this memoised instance.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  // Crossfade: the previous uri stays mounted underneath while the new one
  // fades in over ~200ms, so track changes don't pop.
  const [shownUri, setShownUri] = useState<string | undefined>(uri);
  const [prevUri, setPrevUri] = useState<string | undefined>(undefined);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (uri !== shownUri) {
      if (!uri) {
        setPrevUri(undefined);
        setShownUri(undefined);
      } else {
        setPrevUri(shownUri);
        fade.value = 0;
        setShownUri(uri);
        fade.value = withTiming(1, { duration: 200 });
        const t = setTimeout(() => setPrevUri((p) => (p === shownUri ? undefined : p)), 300);
        return () => clearTimeout(t);
      }
    }
  }, [uri, shownUri, fade]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
  }));

  const borderRadius = useMemo(() => ({ borderRadius: radius }) as ImageStyle, [radius]);
  const [c0, c1] = colors?.length === 2 ? colors : ['#1DB954', '#0a0a0a'];
  const gradientColors = useMemo(() => [c0, c1, mixColor(c0, c1)], [c0, c1]);

  // Numeric (bundled asset) sources pass straight through — no remote fade needed.
  if (typeof source === 'number') {
    return (
      <Image source={source} style={[borderRadius, style]} accessible={accessible ?? false} />
    );
  }

  if (shownUri && failedUri !== shownUri) {
    return (
      <Animated.View style={[borderRadius, style, { overflow: 'hidden' }]}>
        {prevUri && prevUri !== shownUri && failedUri !== prevUri ? (
          <Image
            source={{ uri: prevUri }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            accessible={false}
          />
        ) : (
          <LinearGradient
            colors={gradientColors as [string, string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
        )}
        <Image
          source={{ uri: shownUri }}
          style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, fadeStyle]}
          onError={() => setFailedUri(shownUri)}
          accessible={accessible ?? false}
        />
      </Animated.View>
    );
  }

  return (
    <LinearGradient
      colors={gradientColors as [string, string, string]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[borderRadius, style]}
    />
  );
}, areEqual);
