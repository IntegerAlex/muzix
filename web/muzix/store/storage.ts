import { Platform } from 'react-native';

const memoryStorage = new Map<string, string>();

function getWebStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined' && localStorage?.getItem) {
      return localStorage;
    }
  } catch {}
  return null;
}

function getNativeStorage(): {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} | null {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage?.getItem) {
      return AsyncStorage;
    }
  } catch {}
  return null;
}

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      const w = getWebStorage();
      if (w) return w.getItem(key);
      return memoryStorage.get(key) ?? null;
    }
    const native = getNativeStorage();
    if (native) {
      try {
        return await native.getItem(key);
      } catch {}
    }
    return memoryStorage.get(key) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      const w = getWebStorage();
      if (w) w.setItem(key, value);
      memoryStorage.set(key, value);
      return;
    }
    const native = getNativeStorage();
    if (native) {
      try {
        await native.setItem(key, value);
        return;
      } catch {}
    }
    memoryStorage.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      const w = getWebStorage();
      if (w) w.removeItem(key);
      memoryStorage.delete(key);
      return;
    }
    const native = getNativeStorage();
    if (native) {
      try {
        await native.removeItem(key);
        return;
      } catch {}
    }
    memoryStorage.delete(key);
  },
};
