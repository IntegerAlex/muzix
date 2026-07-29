import { useCallback } from 'react';
import { Platform } from 'react-native';

type HapticType = 'light' | 'medium' | 'success' | 'error';

export function useHaptics() {
  const impact = useCallback(async (type: HapticType = 'light') => {
    if (Platform.OS === 'web') return;
    try {
      const Haptics = await import('expo-haptics');
      switch (type) {
        case 'light':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case 'medium':
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'success':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case 'error':
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
      }
    } catch {
      // haptics unavailable
    }
  }, []);

  return { impact };
}
