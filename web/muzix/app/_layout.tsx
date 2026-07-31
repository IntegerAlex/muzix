import '@tamagui/core/reset.css';

import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { Text, View, Animated } from 'react-native';
import { Music } from '@/lib/icons';
import { router, usePathname } from 'expo-router';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useConnectivity } from '@/hooks/useConnectivity';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useHaptics } from '@/hooks/useHaptics';
import QueuePanel from '@/components/QueuePanel';
import { usePlayerStore } from '@/store/playerStore';
import { MiniPlayer } from '@/components/MiniPlayer';
import { NowPlaying } from '@/components/NowPlaying';
import { PlayerBridge } from '@/components/PlayerBridge';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { Skeleton } from '@/components/Skeleton';
import { TamaguiProvider } from 'tamagui';
import config from '../tamagui.config';
import { ToastProvider } from '@/components/Toast';
import { useAuthStore } from '@/store/authStore';
import { BG, TEXT_PRIMARY, SURFACE_ICON, DANGER } from '@/lib/colors';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';

Sentry.init({
  dsn: 'https://c0faa5751f993e71d1fb4646f7b8d278@o4511132584574976.ingest.de.sentry.io/4511829268234320',
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: __DEV__ ? 1.0 : 0.2,
  enableNativeFramesTracking: !isRunningInExpoGo(),
});

const PUBLIC_ROUTES = ['/login', '/register'];

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const loading = useAuthStore((s) => s.loading);

  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const authed = !!token;

  const [showQueue, setShowQueue] = useState(false);
  const insets = useSafeAreaInsets();

  useKeyboardShortcuts({
    onQueue: () => setShowQueue(v => !v),
    onCloseNowPlaying: () => usePlayerStore.getState().setShowNowPlaying(false),
  });

  const { isOnline } = useConnectivity();
  const [offlineAnim] = useState(() => new Animated.Value(0));
  const [prevOnline, setPrevOnline] = useState(true);

  useEffect(() => {
    if (!isOnline && prevOnline) {
      Animated.timing(offlineAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    } else if (isOnline && !prevOnline) {
      Animated.timing(offlineAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
    setPrevOnline(isOnline);
  }, [isOnline]);

  const { impact } = useHaptics();
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const handleLike = () => { impact('medium'); };
    window.addEventListener('like-song', handleLike);
    window.addEventListener('unlike-song', handleLike);
    return () => {
      window.removeEventListener('like-song', handleLike);
      window.removeEventListener('unlike-song', handleLike);
    };
  }, [impact]);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.activeElement;
    if (el && el !== document.body && el instanceof Element) {
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
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason?.name === 'AbortError' || String(e.reason).includes('play() request was interrupted')) {
        e.preventDefault();
      } else {
        console.warn('[unhandledrejection]', e.reason);
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  if (loading) {
    return (
      <TamaguiProvider config={config} defaultTheme={colorScheme === 'dark' ? 'dark' : 'light'}>
        <View style={{ flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: SURFACE_ICON, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <Music size={36} color={TEXT_PRIMARY} strokeWidth={1.5} />
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
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <ErrorBoundary>
            <View style={{ flex: 1 }}>
              <Animated.View style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: DANGER,
                zIndex: 1000,
                paddingTop: insets.top,
                paddingBottom: 8,
                paddingHorizontal: 16,
                alignItems: 'center',
                transform: [{ translateY: offlineAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }],
              }}>
                <Text style={{ color: TEXT_PRIMARY, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                  You&apos;re offline — some features may be limited
                </Text>
              </Animated.View>
              <View style={{ flex: 1 }}>
                <AnimatedBackdrop />
                <Stack screenOptions={{ headerShown: false }} />
                <MiniPlayer />
                <NowPlaying />
                <PlayerBridge />
              </View>
              {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
            </View>
          </ErrorBoundary>
        </ThemeProvider>
      </ToastProvider>
    </TamaguiProvider>
  );
}

const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: !isRunningInExpoGo(),
});

export default Sentry.wrap(RootLayoutInner);
