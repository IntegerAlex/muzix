import { create } from 'zustand';
import { authStorage, type Tokens } from './authStorage';
import { type User } from '@/services/api';
import { api } from '@/services/api';
import { clearActiveLockScreenControls } from '@/services/audioSession';

let _playerStoreRef: (() => any) | null = null;
function getPlayerStore() {
  if (!_playerStoreRef) {
    _playerStoreRef = () => require('@/store/playerStore').usePlayerStore;
  }
  return _playerStoreRef();
}

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  loading: boolean;
  tokenExpiresAt: number | null;
  setAuth: (token: string, refreshToken: string, user: User) => void;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  refreshTokens: () => Promise<{ token: string; refreshToken: string; expiresAt: number } | null>;
  isTokenExpired: () => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  loading: true,
  tokenExpiresAt: null,

  setAuth: (token: string, refreshToken: string, user: User) => {
    const expiresAt = parseJwtExpiry(token);
    authStorage.saveTokens(token, refreshToken, expiresAt ?? Date.now());
    set({ token, refreshToken, user, loading: false, tokenExpiresAt: expiresAt });
    getPlayerStore().getState().syncLikes();
    getPlayerStore().getState().syncRecent();
  },

  logout: async () => {
    try {
      await authStorage.clearTokens();
    } catch {}
    clearActiveLockScreenControls();
    const playerState = getPlayerStore().getState();
    playerState.setConnectionStatus?.('online');
    set({ token: null, refreshToken: null, user: null, loading: false, tokenExpiresAt: null });
  },

  hydrate: async () => {
    set({ loading: true });
    let tokens: Tokens | null = null;
    try {
      tokens = await authStorage.getTokens();
    } catch {
      authStorage.clearTokens();
      set({ loading: false });
      return;
    }

    if (!tokens) {
      set({ loading: false });
      return;
    }

    const now = Date.now();
    if (tokens.expiresAt && now < tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
      set({
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiresAt: tokens.expiresAt,
        user: null,
        loading: false,
      });
      api.me(tokens.accessToken).then((user) => {
        set({ user });
        getPlayerStore().getState().syncLikes();
        getPlayerStore().getState().syncRecent();
      }).catch(() => {
        getPlayerStore().getState().syncLikes();
        getPlayerStore().getState().syncRecent();
      });
      return;
    }

    const { refreshToken } = tokens;
    if (!refreshToken) {
      authStorage.clearTokens();
      set({ token: null, refreshToken: null, user: null, loading: false, tokenExpiresAt: null });
      return;
    }

    const refreshed = await get().refreshTokens();
    if (refreshed) {
      getPlayerStore().getState().syncLikes();
      getPlayerStore().getState().syncRecent();
    } else {
      authStorage.clearTokens();
      set({ token: null, refreshToken: null, user: null, loading: false, tokenExpiresAt: null });
    }
  },

  refreshTokens: async () => {
    const { refreshToken } = get();
    if (!refreshToken) return null;
    try {
      const data = await api.refresh(refreshToken);
      const expiresAt = parseJwtExpiry(data.token) ?? Date.now();
      authStorage.saveTokens(data.token, data.refreshToken, expiresAt);
      set({
        token: data.token,
        refreshToken: data.refreshToken,
        tokenExpiresAt: expiresAt,
        user: data.user,
      });
      return { token: data.token, refreshToken: data.refreshToken, expiresAt };
    } catch {
      return null;
    }
  },

  isTokenExpired: () => {
    const { tokenExpiresAt } = get();
    if (!tokenExpiresAt) return false;
    return Date.now() > tokenExpiresAt - TOKEN_EXPIRY_BUFFER_MS;
  },
}));

function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(base64Decode(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

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
