import { memo, useEffect } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const Skeleton = memo(function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ width, height, borderRadius, backgroundColor: 'rgba(255,255,255,0.08)' }, animatedStyle, style]} />
  );
});

const SongSkeleton = memo(function SongSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
      <Skeleton width={48} height={48} borderRadius={8} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={14} borderRadius={4} />
        <Skeleton width="45%" height={12} borderRadius={4} />
      </View>
      <Skeleton width={30} height={12} borderRadius={4} />
    </View>
  );
});

const CardSkeleton = memo(function CardSkeleton({ width = 155 }: { width?: number }) {
  return (
    <View style={{ width }}>
      <Skeleton width={width} height={width} borderRadius={20} />
      <View style={{ marginTop: 10, gap: 6 }}>
        <Skeleton width="80%" height={13} borderRadius={4} />
        <Skeleton width="60%" height={11} borderRadius={4} />
      </View>
    </View>
  );
});

export { Skeleton, SongSkeleton, CardSkeleton };