import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import {
  setAudioModeAsync,
  requestNotificationPermissionsAsync,
  type AudioPlayer,
} from 'expo-audio';

const IS_WEB = Platform.OS === 'web';

let _initialized = false;
let _activePlayer: AudioPlayer | null = null;

export function setActivePlayer(player: AudioPlayer | null): void {
  _activePlayer = player;
}

export async function initAudioSession(): Promise<void> {
  if (_initialized || IS_WEB) return;
  _initialized = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
    });
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (IS_WEB) return false;
  try {
    const { granted } = await requestNotificationPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

export interface LockScreenMetadata {
  title?: string;
  artist?: string;
  albumTitle?: string;
  artworkUrl?: string;
}

export function activateLockScreen(player: AudioPlayer, meta: LockScreenMetadata): void {
  if (IS_WEB) return;
  try {
    player.setActiveForLockScreen(true, meta, {
      showSeekForward: true,
      showSeekBackward: true,
    });
  } catch {}
}

export function updateLockScreenMetadata(player: AudioPlayer, meta: LockScreenMetadata): void {
  if (IS_WEB) return;
  try {
    player.updateLockScreenMetadata(meta);
  } catch {}
}

export function clearLockScreenControls(player: AudioPlayer): void {
  if (IS_WEB) return;
  try {
    player.clearLockScreenControls();
  } catch {}
}

export function clearActiveLockScreenControls(): void {
  if (!_activePlayer) return;
  clearLockScreenControls(_activePlayer);
}

export function useAppStateAudioSync(
  player: AudioPlayer | null,
  getActualPlaying: () => boolean,
  setStorePlaying: (v: boolean) => void,
): void {
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (IS_WEB || !player) return;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextAppState;
      if ((prev === 'background' || prev === 'inactive') && nextAppState === 'active') {
        const actual = getActualPlaying();
        setStorePlaying(actual);
      }
    });
    return () => subscription.remove();
  }, [player, getActualPlaying, setStorePlaying]);
}
