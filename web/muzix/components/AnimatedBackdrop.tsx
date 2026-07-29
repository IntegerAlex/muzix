import { useEffect, useState } from 'react';
import { View } from 'tamagui';
import { useWindowDimensions, AccessibilityInfo } from 'react-native';
import { BG } from '@/lib/colors';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';

export function AnimatedBackdrop() {
  const { width, height } = useWindowDimensions();
  const [prefersReducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => sub.remove();
  }, []);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      progress.value = 1;
      return;
    }
    progress.value = withRepeat(
      withTiming(1, { duration: 12000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [progress, prefersReducedMotion]);

  const orbA = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#7c3aed', '#2563eb']),
  }));
  const orbB = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#ec4899', '#06b6d4']),
  }));

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: BG,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <Animated.View
        style={[
          orbA,
          {
            position: 'absolute',
            width: width * 0.9,
            height: width * 0.9,
            top: -width * 0.25,
            left: -width * 0.2,
            borderRadius: 9999,
            opacity: 0.55,
          },
        ]}
      />
      <Animated.View
        style={[
          orbB,
          {
            position: 'absolute',
            width: width * 0.8,
            height: width * 0.8,
            bottom: -height * 0.2,
            right: -width * 0.25,
            borderRadius: 9999,
            opacity: 0.5,
          },
        ]}
      />
    </View>
  );
}
