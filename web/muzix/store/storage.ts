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
    const mmkvModule = require('react-native-mmkv');
    // react-native-mmkv v4 dropped the `MMKV` constructor in favour of
    // `createMMKV()`. v3 and earlier used `new MMKV(...)`. Support both so a
    // version bump/downgrade can't silently send all storage back to memory.
    if (typeof mmkvModule.createMMKV === 'function') {
      _mmkv = mmkvModule.createMMKV({ id: 'muzix' });
    } else if (typeof mmkvModule.MMKV === 'function') {
      _mmkv = new mmkvModule.MMKV({ id: 'muzix' });
    } else {
      throw new Error('no MMKV factory export (createMMKV/MMKV both missing)');
    }
    return _mmkv;
  } catch (e) {
    console.warn('[storage] MMKV unavailable, falling back to in-memory:', e);
    return null;
  }
}

/** v4 renamed `delete(key)` to `remove(key)`. */
function mmkvRemove(mmkv: any, key: string): boolean {
  if (typeof mmkv.remove === 'function') return mmkv.remove(key);
  if (typeof mmkv.delete === 'function') return mmkv.delete(key);
  return false;
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
      mmkvRemove(mmkv, key);
      return;
    }
    memoryStorage.delete(key);
  },
};
