import { useWindowDimensions } from 'react-native';

export type Orientation = 'portrait' | 'landscape';

export interface ResponsiveState {
  width: number;
  height: number;
  orientation: Orientation;
  isSm: boolean;
  isMd: boolean;
  isLg: boolean;
  isXl: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

export function useResponsive(): ResponsiveState {
  const { width, height } = useWindowDimensions();
  const orientation = width >= height ? 'landscape' : 'portrait';

  return {
    width,
    height,
    orientation,
    isSm: width <= 640,
    isMd: width > 640 && width <= 768,
    isLg: width > 768 && width <= 1023,
    isXl: width >= 1024,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}
