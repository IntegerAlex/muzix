import { forwardRef } from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface LyricsImageGeneratorProps {
  lines: string[];
  title: string;
  artist: string;
  imageUrl?: string;
  colors?: [string, string];
}

const W = 1080;
const H = 1920;

export const LyricsImageGenerator = forwardRef<View, LyricsImageGeneratorProps>(
  function LyricsImageGenerator({ lines, title, artist, imageUrl, colors }, ref) {
    const [c0, c1] = colors ?? ['#1DB954', '#0b1020'];

    return (
      <View ref={ref} style={styles.container} collapsable={false}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.bgImage} />
        ) : (
          <LinearGradient
            colors={[c0, c1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bgImage}
          />
        )}
        <View style={styles.overlay}>
          <Text style={styles.brand}>MUZIX</Text>
          <View style={styles.lyricsArea}>
            {lines.map((line, i) => (
              <Text key={i} style={styles.lyricLine}>{line}</Text>
            ))}
          </View>
          <Text style={styles.songTitle} numberOfLines={2}>{title}</Text>
          <Text style={styles.artistName} numberOfLines={1}>{artist}</Text>
        </View>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  container: {
    width: W,
    height: H,
    position: 'absolute',
    left: -9999,
    top: 0,
  },
  bgImage: {
    width: W,
    height: H,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 60,
    paddingVertical: 120,
  },
  brand: {
    position: 'absolute',
    top: 100,
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 8,
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
  },
  songTitle: {
    position: 'absolute',
    bottom: 140,
    fontSize: 36,
    fontWeight: '700',
    color: 'white',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  artistName: {
    position: 'absolute',
    bottom: 80,
    fontSize: 24,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
});
