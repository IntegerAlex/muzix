import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from 'tamagui';

const customTokens = {
  color: {
    background: '#0b1020',
    surface: 'rgba(28,28,32,0.72)',
    surfaceElevated: 'rgba(255,255,255,0.03)',
    accent: '#1DB954',
    accentHover: '#1ed760',
    danger: '#f43f5e',
    textPrimary: 'white',
    textSecondary: 'rgba(255,255,255,0.55)',
    textTertiary: 'rgba(255,255,255,0.3)',
    border: 'rgba(255,255,255,0.08)',
    borderSubtle: 'rgba(255,255,255,0.06)',
    borderInput: 'rgba(255,255,255,0.10)',
    borderInputFocus: 'rgba(29,185,84,0.5)',
    inputBackground: 'rgba(255,255,255,0.06)',
    inputPlaceholder: 'rgba(255,255,255,0.2)',
    overlay: 'rgba(0,0,0,0.65)',
  },
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    true: 12,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    full: 9999,
    true: 12,
  },
  fontSize: {
    micro: 10,
    small: 11,
    caption: 13,
    body: 15,
    subheading: 17,
    heading: 20,
    title: 28,
    display: 32,
    true: 15,
  },
  fontWeight: {
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
    true: '500',
  },
};

const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    ...customTokens,
  },
});

export default tamaguiConfig;

type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
