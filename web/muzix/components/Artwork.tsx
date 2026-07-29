import { useMemo, useState, memo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, type ImageStyle, type StyleProp } from 'react-native';

interface ArtworkProps {
  source?: { uri: string } | number;
  colors?: [string, string];
  style?: StyleProp<ImageStyle>;
  radius?: number;
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
  return true;
}

export const Artwork = memo(function Artwork({ source, colors, style, radius = 12 }: ArtworkProps) {
  const [imgError, setImgError] = useState(false);
  const borderRadius = useMemo(() => ({ borderRadius: radius }) as ImageStyle, [radius]);
  const [c0, c1] = colors?.length === 2 ? colors : ['#1DB954', '#0a0a0a'];
  const gradientColors = useMemo(() => [c0, c1, mixColor(c0, c1)], [c0, c1]);

  if (source && !imgError) {
    return (
      <Image source={source} style={[borderRadius, style]} onError={() => setImgError(true)} />
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
