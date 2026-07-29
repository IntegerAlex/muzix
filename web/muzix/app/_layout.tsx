import '@tamagui/core/reset.css';

import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { NowPlaying } from '@/components/NowPlaying';
import { PlayerBridge } from '@/components/PlayerBridge';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { Skeleton } from '@/components/Skeleton';
import { TamaguiProvider } from 'tamagui';
import config from '../tamagui.config';
import { loadAll } from '@/services/data';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';
import { BG, TEXT_PRIMARY, ACCENT, SURFACE_ICON } from '@/lib/colors';

const PUBLIC_ROUTES = ['/login', '/register'];

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const loading = useAuthStore((s) => s.loading);

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const authed = !!token;

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.activeElement as HTMLElement | null;
    if (el && el !== document.body) {
      const hiddenAncestor = el.closest('[aria-hidden="true"], [inert]');
      const style = hiddenAncestor as HTMLElement | null;
      if (style && getComputedStyle(style).display === 'none') {
        el.blur();
      }
    }
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (!authed && !isPublic) {
      router.replace('/login');
    } else if (authed && isPublic) {
      router.replace('/');
    }
  }, [authed, loading, pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason?.name === 'AbortError' || String(e.reason).includes('play() request was interrupted')) {
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (loading) {
    return (
      <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
        <View style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: SURFACE_ICON, alignItems: 'center', justifyContent: 'center' }}>
            <Skeleton width={36} height={36} borderRadius={12} />
          </View>
          <Skeleton width="60%" height={28} borderRadius={8} style={{ marginTop: 24 }} />
          <Text style={{ color: TEXT_PRIMARY, marginTop: 12, fontSize: 14 }}>Loading music...</Text>
        </View>
      </TamaguiProvider>
    );
  }

  return (
    <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
      <ToastProvider>
        <ThemeProvider value={NAV_THEME[(colorScheme ?? 'light') as 'light' | 'dark']}>
          <StatusBar style="light" />
          <View style={{ flex: 1 }}>
            <AnimatedBackdrop />
            <Stack screenOptions={{ headerShown: false }} />
            <MiniPlayer />
            <NowPlaying />
            <PlayerBridge />
          </View>
        </ThemeProvider>
      </ToastProvider>
    </TamaguiProvider>
  );
}
