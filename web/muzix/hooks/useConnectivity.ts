import { useEffect, useState } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { retryQueuedRequests } from '@/services/offlineQueue';
import { isOnline as getIsOnline, onStatusChange } from '@/services/networkStatus';

export function useConnectivity() {
  const [isOnline, setIsOnline] = useState(getIsOnline);
  const setConnectionStatus = usePlayerStore((s) => s.setConnectionStatus);

  useEffect(() => {
    return onStatusChange((online) => {
      setIsOnline(online);
      setConnectionStatus(online ? 'online' : 'offline');
      if (online) {
        retryQueuedRequests();
      }
    });
  }, [setConnectionStatus]);

  return { isOnline, isOffline: !isOnline };
}
