import { memo, useCallback } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  scaleTo?: number;
  accessibilityLabel?: string;
  accessibilityRole?: string;
}

export const PressableScale = memo(function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.95,
  accessibilityLabel,
  accessibilityRole,
}: PressableScaleProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(scaleTo, { duration: 120, easing: Easing.out(Easing.ease) });
  }, [scale, scaleTo]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
  }, [scale]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[animatedStyle, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
    >
      {children}
    </AnimatedPressable>
  );
});
