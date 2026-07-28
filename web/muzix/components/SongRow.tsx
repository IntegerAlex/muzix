import { useCallback, useEffect, memo, useRef } from 'react';
import { Text, View } from 'tamagui';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Artwork } from '@/components/Artwork';
import { PressableScale } from '@/components/PressableScale';
import { Skeleton } from '@/components/Skeleton';
import { usePlayerStore } from '@/store/playerStore';
import type { Song } from '@/services/types';

export function EqualizerBar({ phase }: { phase: number }) {
  const h = useSharedValue(4 + Math.sin(phase) * 4);
  useEffect(() => {
    h.value = withRepeat(
      withTiming(16, { duration: 500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [h]);
  const style = useAnimatedStyle(() => ({ height: h.value }));
  return <Animated.View style={[style, { width: 4, borderRadius: 9999, backgroundColor: 'white' }]} />;
}

export function Equalizer() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 }}>
      {[0, 1, 2].map((i) => (
        <EqualizerBar key={i} phase={i * 0.18} />
      ))}
    </View>
  );
}

interface SongRowProps {
  song: Song;
  index: number;
  queue: Song[];
  isCurrent: boolean;
  subtitle?: string;
}

export const SongRow = memo(function SongRow({ song, index, queue, isCurrent, subtitle }: SongRowProps) {
  const playSong = usePlayerStore((s) => s.playSong);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const handlePress = useCallback(() => {
    playSong(song, queueRef.current, index);
  }, [playSong, song, index]);

  return (
    <PressableScale
      onPress={handlePress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 }}
      accessibilityLabel={`${song.title} by ${song.artist}`}
      accessibilityRole="button"
    >
      <Artwork source={song.imageUrl ? { uri: song.imageUrl } : undefined} colors={song.colors} style={{ height: 48, width: 48, borderRadius: 8 }} radius={8} />
      <View style={{ flex: 1 }}>
        <Text
          fontSize={14}
          fontWeight="700"
          color="white"
          numberOfLines={1}
        >
          {song.title}
        </Text>
        <Text fontSize={12} color="rgba(255,255,255,0.5)" numberOfLines={1}>
          {subtitle ?? song.artist}
        </Text>
      </View>
      {isCurrent ? (
        <Equalizer />
      ) : (
        <Text fontSize={12} color="rgba(255,255,255,0.4)">{song.duration}</Text>
      )}
    </PressableScale>
  );
});

export function SongRowSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 }}>
      <Skeleton width={48} height={48} borderRadius={8} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={14} borderRadius={4} />
        <Skeleton width="45%" height={12} borderRadius={4} />
      </View>
      <Skeleton width={30} height={12} borderRadius={4} />
    </View>
  );
}
