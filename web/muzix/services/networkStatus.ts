import { Platform } from 'react-native';

type StatusCallback = (online: boolean) => void;

const listeners = new Set<StatusCallback>();
let currentOnline = true;

export function isOnline(): boolean {
  if (Platform.OS === 'web') {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }
  return currentOnline;
}

export function onStatusChange(callback: StatusCallback): () => void {
  listeners.add(callback);

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const handleOnline = () => { currentOnline = true; broadcast(true); };
    const handleOffline = () => { currentOnline = false; broadcast(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      listeners.delete(callback);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  return () => { listeners.delete(callback); };
}

function broadcast(online: boolean): void {
  listeners.forEach((cb) => {
    try { cb(online); } catch {}
  });
}

export function setOnlineStatus(online: boolean): void {
  currentOnline = online;
  broadcast(online);
}

interface QueuedRequest {
  id: string;
  fn: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const queue: QueuedRequest[] = [];
let queueId = 0;

export function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = String(queueId++);
    queue.push({ id, fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject });
  });
}

function flushQueue(): void {
  const pending = [...queue];
  queue.length = 0;
  pending.forEach((req) => {
    req.fn().then(req.resolve).catch(req.reject);
  });
}

onStatusChange((online) => {
  if (online) flushQueue();
});
