import { forwardRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

interface LyricsImageGeneratorProps {
  lines: string[];
  title: string;
  artist: string;
  imageUrl?: string;
  colors?: [string, string];
  timestamp?: string;
}

const { width: screenW } = Dimensions.get('window');
const W = Math.min(screenW * 0.9, 1080);
const H = W * 1.7778;

const FONT_FAMILY = Platform.select({
  ios: 'System',
  android: 'System',
  default: 'System',
});

export const LyricsImageGenerator = forwardRef<View, LyricsImageGeneratorProps>(
  function LyricsImageGenerator({ lines, title, artist, imageUrl, colors, timestamp }, ref) {
    const [c0, c1] = colors ?? ['#1DB954', '#0a0a0a'];

    return (
      <View ref={ref} style={[styles.container, { width: W, height: H, left: -W - 100 }]} collapsable={false}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={[styles.bgImage, { width: W, height: H }]} />
        ) : (
          <LinearGradient
            colors={[c0, c1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.bgImage, { width: W, height: H }]}
          />
        )}
        <View style={styles.overlay}>
          <Text style={styles.brand}>MUZIX</Text>
          <View style={styles.lyricsArea}>
            {lines.map((line, i) => (
              <Text key={i} style={styles.lyricLine}>{line}</Text>
            ))}
          </View>
          {timestamp && timestamp > '0:00' && (
            <Text style={styles.timestamp}>{timestamp}</Text>
          )}
          <Text style={styles.songTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{artist}</Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
  },
  bgImage: {
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: '5%',
    paddingVertical: '6%',
  },
  brand: {
    position: 'absolute',
    top: '5%',
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 8,
    fontFamily: FONT_FAMILY,
  },
  lyricsArea: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
  },
  lyricLine: {
    fontSize: 48,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    fontFamily: FONT_FAMILY,
    letterSpacing: -0.5,
    lineHeight: 64,
  },
  timestamp: {
    position: 'absolute',
    bottom: '13%',
    right: '5%',
    fontSize: 14,
    color: 'white',
    fontFamily: FONT_FAMILY,
  },
  songTitle: {
    position: 'absolute',
    bottom: '8%',
    fontSize: 36,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 40,
    fontFamily: FONT_FAMILY,
    letterSpacing: -0.3,
  },
  artistName: {
    position: 'absolute',
    bottom: '4%',
    fontSize: 24,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    letterSpacing: -0.2,
  },
});
