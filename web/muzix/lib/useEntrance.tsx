import { useEffect, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

export function AnimatedEntrance({ index, children }: { index: number; children: ReactNode }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(14);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 350, delay: index * 50, easing: Easing.out(Easing.ease) });
    translateY.value = withTiming(0, { duration: 350, delay: index * 50, easing: Easing.out(Easing.ease) });
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
