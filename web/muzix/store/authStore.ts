import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, type AuthResponse, type User } from '@/services/api';

let _playerStoreRef: (() => any) | null = null;
function getPlayerStore() {
  if (!_playerStoreRef) {
    _playerStoreRef = () => require('@/store/playerStore').usePlayerStore;
  }
  return _playerStoreRef();
}

function safeRemoveItem(key: string) {
  if (typeof localStorage !== 'undefined' && localStorage?.removeItem) {
    try { localStorage.removeItem(key); } catch {}
  }
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
            useAuthStore.getState().logout();
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
      onRehydrateStorage: () => (state) => state?.hydrate(),
    }
  )
);

function parseJwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export async function register(email: string, password: string, displayName?: string): Promise<AuthResponse> {
  return api.register(email, password, displayName);
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return api.login(email, password);
}
