import { useCallback } from 'react';

type HapticType = 'light' | 'medium' | 'success' | 'error';

export function useHaptics() {
  const impact = useCallback(async (_type: HapticType = 'light') => {}, []);
  return { impact };
}
