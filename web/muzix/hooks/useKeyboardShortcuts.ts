import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePlayerStore } from '@/store/playerStore';

type KeyAction =
  | 'playPause'
  | 'next'
  | 'previous'
  | 'like'
  | 'toggleQueue'
  | 'seekForward'
  | 'seekBackward'
  | 'volumeUp'
  | 'volumeDown'
  | 'escape'
  | 'closeNowPlaying';

interface ShortcutsConfig {
  onQueue?: () => void;
  onToggleNowPlaying?: () => void;
  onCloseNowPlaying?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(config: ShortcutsConfig = {}) {
  const { enabled = true, onQueue, onToggleNowPlaying, onCloseNowPlaying } = config;

  useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== 'web') return;

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const store = usePlayerStore.getState();

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (store.current) store.setPlaying(!store.isPlaying);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (store.current) store.next();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (store.current) store.previous();
          break;
        case 'KeyN':
          e.preventDefault();
          if (store.current) store.next();
          break;
        case 'KeyP':
          e.preventDefault();
          if (store.current) store.previous();
          break;
        case 'KeyL':
          e.preventDefault();
          if (store.current) store.toggleLike(store.current.id);
          break;
        case 'KeyQ':
          e.preventDefault();
          onQueue?.();
          break;
        case 'Escape':
          e.preventDefault();
          if (onCloseNowPlaying) onCloseNowPlaying();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onQueue, onToggleNowPlaying, onCloseNowPlaying]);
}
