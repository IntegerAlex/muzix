import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from './storage';
import { type User } from '@/services/api';

let _playerStoreRef: (() => any) | null = null;
function getPlayerStore() {
  if (!_playerStoreRef) {
    _playerStoreRef = () => require('@/store/playerStore').usePlayerStore;
  }
  return _playerStoreRef();
}

function safeRemoveItem(key: string) {
  try {
    safeStorage.removeItem(key);
  } catch {}
}

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  tokenExpiresAt: number | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  hydrate: () => void;
  isTokenExpired: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      loading: true,
      tokenExpiresAt: null,
      setAuth: (token, user) => {
        const expiresIn = parseJwtExpiry(token);
        set({ token, user, loading: false, tokenExpiresAt: expiresIn });
        getPlayerStore().getState().syncLikes();
        getPlayerStore().getState().syncRecent();
      },
      logout: () => {
        safeRemoveItem('auth-storage');
        const playerState = getPlayerStore().getState();
        playerState.setConnectionStatus?.('online');
        set({ token: null, user: null, loading: false, tokenExpiresAt: null });
      },
      hydrate: () => {
        set({ loading: false });
        setTimeout(() => {
          const { token, tokenExpiresAt } = useAuthStore.getState();
          if (token && tokenExpiresAt && Date.now() > tokenExpiresAt) {
            if (typeof navigator !== 'undefined' && navigator.onLine) {
              useAuthStore.getState().logout();
            }
            return;
          }
          if (token) {
            getPlayerStore().getState().syncLikes();
            getPlayerStore().getState().syncRecent();
          }
        }, 0);
      },
      isTokenExpired: () => {
        const { tokenExpiresAt } = get();
        if (!tokenExpiresAt) return false;
        return Date.now() > tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS;
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => safeStorage),
      onRehydrateStorage: () => (state) => state?.hydrate(),
    }
  )
);

function base64Decode(str: string): string {
  if (typeof atob !== 'undefined') return atob(str);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  str = str.replace(/=+$/, '');
  for (let i = 0; i < str.length; i += 4) {
    const a = chars.indexOf(str[i]);
    const b = chars.indexOf(str[i + 1]);
    const c = chars.indexOf(str[i + 2]);
    const d = chars.indexOf(str[i + 3]);
    output += String.fromCharCode((a << 2) | (b >> 4));
    if (c !== -1) output += String.fromCharCode(((b & 15) << 4) | (c >> 2));
    if (d !== -1) output += String.fromCharCode(((c & 3) << 6) | d);
  }
  return output;
}

function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(base64Decode(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}


