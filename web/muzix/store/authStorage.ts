import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const NATIVE_KEYS = {
  accessToken: 'muzix_access_token',
  refreshToken: 'muzix_refresh_token',
  expiresAt: 'muzix_token_expires_at',
};

const WEB_KEYS = {
  accessToken: 'muzix_access_token_web',
  refreshToken: 'muzix_refresh_token_web',
  expiresAt: 'muzix_token_expires_at_web',
};

async function getNative(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function setNative(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    console.warn('[authStorage] setNative failed', key);
  }
}

async function deleteNative(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    console.warn('[authStorage] deleteNative failed', key);
  }
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export const authStorage = {
  async getTokens(): Promise<Tokens | null> {
    if (Platform.OS === 'web') {
      const accessToken = localStorage.getItem(WEB_KEYS.accessToken);
      if (!accessToken) return null;
      return {
        accessToken,
        refreshToken: localStorage.getItem(WEB_KEYS.refreshToken) ?? '',
        expiresAt: localStorage.getItem(WEB_KEYS.expiresAt)
          ? Number(localStorage.getItem(WEB_KEYS.expiresAt))
          : null,
      };
    }
    const [accessToken, refreshToken, expiresAt] = await Promise.all([
      getNative(NATIVE_KEYS.accessToken),
      getNative(NATIVE_KEYS.refreshToken),
      getNative(NATIVE_KEYS.expiresAt),
    ]);
    if (!accessToken) return null;
    return {
      accessToken,
      refreshToken: refreshToken ?? '',
      expiresAt: expiresAt ? Number(expiresAt) : null,
    };
  },

  async saveTokens(accessToken: string, refreshToken: string, expiresAt: number): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(WEB_KEYS.accessToken, accessToken);
      localStorage.setItem(WEB_KEYS.refreshToken, refreshToken);
      localStorage.setItem(WEB_KEYS.expiresAt, String(expiresAt));
      return;
    }
    await Promise.all([
      setNative(NATIVE_KEYS.accessToken, accessToken),
      setNative(NATIVE_KEYS.refreshToken, refreshToken),
      setNative(NATIVE_KEYS.expiresAt, String(expiresAt)),
    ]);
  },

  async clearTokens(): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(WEB_KEYS.accessToken);
      localStorage.removeItem(WEB_KEYS.refreshToken);
      localStorage.removeItem(WEB_KEYS.expiresAt);
      return;
    }
    await Promise.all([
      deleteNative(NATIVE_KEYS.accessToken),
      deleteNative(NATIVE_KEYS.refreshToken),
      deleteNative(NATIVE_KEYS.expiresAt),
    ]);
  },
};
