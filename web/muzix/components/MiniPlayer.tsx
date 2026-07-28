import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { Interactive } from 'interactkit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Pause, Play } from 'lucide-react-native';
import { View, Text } from 'tamagui';
import { Artwork } from '@/components/Artwork';
import { GlassCard } from '@/components/GlassCard';
import { usePlayerStore } from '@/store/playerStore';
import { formatTime } from '@/lib/utils';

const TAB_BAR_HEIGHT = 64;

export function MiniPlayer() {
  const insets = useSafeAreaInsets();
  const current = usePlayerStore((s) => s.current);
  const showNowPlaying = usePlayerStore((s) => s.showNowPlaying);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const loadingId = usePlayerStore((s) => s.loadingId);
  const setPlaying = usePlayerStore((s) => s.setPlaying);
  const setShowNowPlaying = usePlayerStore((s) => s.setShowNowPlaying);

  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const progress = useSharedValue(0);
  const [elapsedText, setElapsedText] = useState('0:00');
  const [progressPct, setProgressPct] = useState(0);

  const isLoading = current ? loadingId === current.id : false;

  const updateElapsed = (value: number) => {
    if (current) setElapsedText(formatTime(value * current.durationMs));
  };

  const elapsed = useDerivedValue(() =>
    current ? progress.value * current.durationMs : 0
  );

  useAnimatedReaction(
    () => elapsed.value,
    (value) => runOnJS(updateElapsed)(value / (current?.durationMs ?? 1))
  );

  useAnimatedReaction(
    () => progress.value,
    (v) => runOnJS(setProgressPct)(Math.round(v * 100))
  );

  useEffect(() => {
    if (current && !showNowPlaying) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 200, mass: 0.8 });
      opacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(100, { duration: 200, easing: Easing.out(Easing.quad) });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [current, showNowPlaying, translateY, opacity]);

  useEffect(() => {
    progress.value = 0;
    if (current && isPlaying && loadingId !== current.id) {
      progress.value = withTiming(1, { duration: current.durationMs, easing: Easing.linear });
    }
  }, [current?.id]);

  useEffect(() => {
    if (!current || !isPlaying) return;
    const remainingMs = (1 - progress.value) * current.durationMs;
    if (remainingMs > 0) {
      progress.value = withTiming(1, { duration: remainingMs, easing: Easing.linear });
    }
  }, [isPlaying]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!current) return null;

  const bottomInset = insets.bottom > 0 ? insets.bottom : 8;

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          position: 'absolute',
          left: 0,
          right: 0,
          zIndex: 40,
          elevation: 40,
          bottom: bottomInset + TAB_BAR_HEIGHT + 2,
          paddingHorizontal: 12,
          pointerEvents: 'box-none',
        },
      ]}
    >
      <GlassCard style={{ paddingHorizontal: 12, paddingVertical: 10 }} intensity={50}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            overflow: 'hidden',
            borderRadius: 9999,
            backgroundColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <View
            style={{
              height: '100%',
              borderRadius: 9999,
              backgroundColor: isLoading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
              width: isLoading ? '100%' : `${progressPct}%`,
              ...(isLoading && {
                opacity: 0.5,
              }),
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
          <Pressable
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            onPress={() => setShowNowPlaying(true)}
            hitSlop={8}
            accessibilityLabel={`Now playing: ${current.title} by ${current.artist}`}
            accessibilityRole="button"
          >
            <Artwork source={current.imageUrl ? { uri: current.imageUrl } : undefined} colors={current.colors} style={{ height: 44, width: 44 }} radius={8} />
            <View style={{ flex: 1 }}>
              <Text fontSize={13} fontWeight="600" color="white" numberOfLines={1}>
                {current.title}
              </Text>
              <Text fontSize={11} color="rgba(255,255,255,0.5)" numberOfLines={1}>
                {current.artist}
              </Text>
            </View>
            {isLoading ? (
              <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" style={{ marginRight: 4 }} />
            ) : (
              <Text fontSize={10} color="rgba(255,255,255,0.3)" style={{ marginRight: 4 }}>{elapsedText}</Text>
            )}
          </Pressable>
          <Interactive hover={{ sound: "bubble-pop-01", volume: 0.4 }} click={{ sound: "bubble-pop-01", volume: 0.6 }}>
            <Pressable
              onPress={() => setPlaying(!isPlaying)}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
              hitSlop={8}
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              accessibilityRole="button"
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : isPlaying ? (
                <Pause size={18} color="white" />
              ) : (
                <Play size={18} color="white" style={{ marginLeft: 2 }} />
              )}
            </Pressable>
          </Interactive>
        </View>
      </GlassCard>
    </Animated.View>
  );
}
