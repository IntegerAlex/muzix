import { useState, useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { retryQueuedRequests } from '@/services/offlineQueue';

function getIsOnline(): boolean {
  if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
    return navigator.onLine;
  }
  return true;
}

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(getIsOnline);
  const setConnectionStatus = usePlayerStore((s) => s.setConnectionStatus);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setConnectionStatus('online');
      retryQueuedRequests();
    }

    function handleOffline() {
      setIsOnline(false);
      setConnectionStatus('offline');
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      }
    };
  }, [setConnectionStatus]);

  return { isOnline, isOffline: !isOnline };
}
