import { memo, useState, useEffect, type ReactNode } from 'react';
import { Platform, View, AccessibilityInfo, type ViewStyle } from 'react-native';
import { BlurView, type BlurMethod } from 'expo-blur';
import { RADIUS } from '@/lib/sizing';
import {
  SURFACE_ELEVATED,
  BORDER,
  GLASS_BLUE_TINT,
  GLASS_ANDROID_DARK_BASE,
} from '@/lib/colors';

const BLUR_METHOD: BlurMethod | undefined = Platform.select({
  android: 'none',
  default: undefined,
});

const GLASS_SHADOW: ViewStyle = Platform.select({
  web: {
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
  },
  ios: {
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  android: {
    elevation: 6,
  },
});

const PLATFORM_BLUR_STYLE: ViewStyle | undefined = Platform.select({
  android: { backgroundColor: GLASS_ANDROID_DARK_BASE },
  default: undefined,
});

const ABSOLUTE_FILL: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  radius?: number;
  padding?: number;
  variant?: 'elevated' | 'glass';
  intensity?: number;
}

export const GlassCard = memo(function GlassCard({
  children,
  style,
  radius = RADIUS.xl,
  padding = 16,
  variant = 'elevated',
  intensity = 40,
}: GlassCardProps) {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') return;
    if (typeof AccessibilityInfo.isReduceTransparencyEnabled === 'function') {
      AccessibilityInfo.isReduceTransparencyEnabled().then(setReduceTransparency).catch(() => {});
    }
    if (typeof AccessibilityInfo.addEventListener !== 'function') return;
    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      setReduceTransparency,
    );
    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      }
    };
  }, []);

  if (variant === 'glass' && reduceTransparency) {
    return (
      <View
        style={[
          {
            borderRadius: radius,
            backgroundColor: SURFACE_ELEVATED,
            borderWidth: 1,
            borderColor: BORDER,
            padding,
          } as ViewStyle,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  if (variant === 'glass') {
    return (
      <View style={[GLASS_SHADOW, style]}>
        <View style={{ borderRadius: radius, overflow: 'hidden' }}>
          <BlurView
            intensity={intensity}
            tint="dark"
            blurMethod={BLUR_METHOD}
            style={[{ padding }, PLATFORM_BLUR_STYLE] as ViewStyle}
          >
            <View
              style={{
                ...ABSOLUTE_FILL,
                backgroundColor: GLASS_BLUE_TINT,
                borderRadius: radius,
              }}
              pointerEvents="none"
            />
            {children}
          </BlurView>
          <View
            style={{
              ...ABSOLUTE_FILL,
              borderRadius: radius,
              borderWidth: 1,
              borderColor: BORDER,
            }}
            pointerEvents="none"
          />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        {
          borderRadius: radius,
          backgroundColor: SURFACE_ELEVATED,
          borderWidth: 1,
          borderColor: BORDER,
          padding,
        } as ViewStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
});
