import { useCallback, useEffect, useState, memo, useRef } from 'react';
import { ActivityIndicator, Pressable, Platform } from 'react-native';
import { Text, View } from 'tamagui';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Share2, Cloud, Check } from '@/lib/icons';
import { Artwork } from '@/components/Artwork';
import { PressableScale } from '@/components/PressableScale';
import { SPACING } from '@/lib/spacing';
import { Skeleton } from '@/components/Skeleton';
import { usePlayerStore } from '@/store/playerStore';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useAuthStore } from '@/store/authStore';
import { apiStream } from '@/services/data';
import { downloadToCache, getCachedAudioPath, markDownloaded } from '@/services/audioCache';
import type { Song } from '@/services/types';
import { TEXT_MUTED, ACCENT } from '@/lib/colors';

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
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.xs, height: 16 }}>
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
  onShare?: (song: Song) => void;
  isSharing?: boolean;
}

export const SongRow = memo(function SongRow({ song, index, queue, isCurrent, subtitle, onShare, isSharing }: SongRowProps) {
  const playSong = usePlayerStore((s) => s.playSong);
  const queueRef = useRef(queue);
  const { isOnline } = useConnectivity();
  const [cached, setCached] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    getCachedAudioPath(song.id).then(p => setCached(!!p)).catch(() => {});
  }, [song.id]);

  const handlePress = useCallback(() => {
    playSong(song, queueRef.current, index);
  }, [playSong, song, index]);

  const handleDownload = useCallback(async () => {
    if (cached || downloading || !isOnline) return;
    setDownloading(true);
    try {
      const { url } = await apiStream(song.id);
      await downloadToCache(song.id, url);
      await markDownloaded(song.id);
      setCached(true);
    } catch {}
    setDownloading(false);
  }, [song.id, cached, downloading, isOnline]);

  return (
    <PressableScale
      onPress={handlePress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: 16 }}
      accessibilityLabel={`${song.title} by ${song.artist}`}
      accessibilityRole="button"
    >
      <Artwork source={song.imageUrl ? { uri: song.imageUrl } : undefined} colors={song.colors} style={{ height: 48, width: 48, borderRadius: 8 }} radius={8} accessible={false} />
      <View style={{ flex: 1 }}>
        <Text
          fontSize={14}
          fontWeight="700"
          color="white"
          numberOfLines={1}
        >
          {song.title}
        </Text>
        <Text fontSize={12} color={TEXT_MUTED} numberOfLines={1}>
          {subtitle ?? song.artist}
        </Text>
      </View>
      {Platform.OS !== 'web' && isOnline && !cached && (
        <Pressable onPress={handleDownload} hitSlop={8} disabled={downloading}>
          {downloading ? <ActivityIndicator size={16} color={TEXT_MUTED} /> : <Cloud size={16} color={TEXT_MUTED} />}
        </Pressable>
      )}
      {Platform.OS !== 'web' && cached && (
        <Check size={16} color={ACCENT} />
      )}
      {onShare && (
        <Pressable
          onPress={() => !isSharing && onShare(song)}
          style={{ opacity: isSharing ? 0.4 : 0.6, padding: 4 }}
          hitSlop={8}
          disabled={isSharing}
          accessibilityLabel={`Share ${song.title}`}
        >
          {isSharing ? <ActivityIndicator size={16} color={TEXT_MUTED} /> : <Share2 size={16} color={TEXT_MUTED} />}
        </Pressable>
      )}
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
