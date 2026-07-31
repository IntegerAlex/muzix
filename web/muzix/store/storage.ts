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

let _mmkv: any = null;
function getMMKV(): any {
  if (_mmkv) return _mmkv;
  try {
    const { MMKV } = require('react-native-mmkv');
    _mmkv = new MMKV({ id: 'muzix' });
    return _mmkv;
  } catch (e) {
    console.warn('[storage] MMKV unavailable, falling back to in-memory:', e);
    return null;
  }
}

export const safeStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      const w = getWebStorage();
      if (w) return w.getItem(key);
      return memoryStorage.get(key) ?? null;
    }
    const mmkv = getMMKV();
    if (mmkv) {
      return mmkv.getString(key) ?? null;
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
    const mmkv = getMMKV();
    if (mmkv) {
      mmkv.set(key, value);
      return;
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
    const mmkv = getMMKV();
    if (mmkv) {
      mmkv.delete(key);
      return;
    }
    memoryStorage.delete(key);
  },
};
