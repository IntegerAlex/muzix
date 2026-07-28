import { memo, type ReactNode } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS } from '@/lib/sizing';

const isIOS26 = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26;

interface GlassCardProps {
  children: ReactNode;
  style?: ViewStyle;
  intensity?: number;
  radius?: number;
  padding?: number;
}

export const GlassCard = memo(function GlassCard({
  children,
  style,
  intensity = 40,
  radius = RADIUS.xl,
  padding = 16,
}: GlassCardProps) {
  if (isIOS26) {
    let GlassView: React.ComponentType<{ style: any; children: React.ReactNode }> | null = null;
    try { GlassView = require('expo-glass-effect').GlassView; } catch {}
    if (GlassView) {
      return (
        <GlassView style={[{ borderRadius: radius, padding }, style]}>
          {children}
        </GlassView>
      );
    }
  }

  return (
    <View
      style={[
        {
          overflow: 'hidden',
          borderRadius: radius,
          backgroundColor: 'rgba(28,28,32,0.72)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.08)',
          padding,
        } as ViewStyle,
        style,
      ]}
    >
      {Platform.OS !== 'web' && (
        <BlurView
          intensity={intensity}
          tint="systemThickMaterial"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
          }}
        />
      )}
      {children}
    </View>
  );
});
