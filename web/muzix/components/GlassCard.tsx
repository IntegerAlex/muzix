import { memo, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { RADIUS } from '@/lib/sizing';
import { SURFACE_ELEVATED, BORDER } from '@/lib/colors';

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  radius?: number;
  padding?: number;
}

export const GlassCard = memo(function GlassCard({
  children,
  style,
  radius = RADIUS.xl,
  padding = 16,
}: GlassCardProps) {
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
