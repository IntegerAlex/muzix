jest.mock('expo-router', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  Link: 'Link',
  Stack: { Screen: 'Screen' },
  Tabs: { Screen: 'Screen' },
}));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
    volume: 0.7,
  }),
  useAudioPlayerStatus: () => ({
    playing: false,
    didJustFinish: false,
  }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
  BlurTargetView: 'BlurTargetView',
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: 'StatusBar',
}));

jest.mock('react-native-reanimated', () => {
  const Reanimated = {
    default: {
      createAnimatedComponent: (component) => component,
      call: () => {},
      Value: jest.fn(),
    },
    useSharedValue: (val) => ({ value: val }),
    useAnimatedStyle: (fn) => fn(),
    useAnimatedReaction: () => {},
    useDerivedValue: (fn) => ({ value: fn() }),
    withSpring: (val) => val,
    withTiming: (val) => val,
    withRepeat: (val) => val,
    Easing: { inOut: () => ({}), out: () => ({}), linear: () => ({}) },
    runOnJS: (fn) => fn,
  };
  return Reanimated;
});

jest.mock('react-native-gesture-handler', () => {});

jest.mock('@react-native-community/slider', () => 'Slider');

jest.mock('tamagui', () => {
  const React = require('react');
  const createComponent = (name) => {
    const Component = React.forwardRef(({ children, ...props }, ref) =>
      React.createElement(name, { ...props, ref }, children)
    );
    Component.displayName = name;
    return Component;
  };
  return {
    View: createComponent('View'),
    Text: createComponent('Text'),
    XStack: createComponent('View'),
    YStack: createComponent('View'),
    styled: (component) => component,
  };
});

jest.mock('@/lib/icons', () => {
  const React = require('react');
  const Icon = (props) => React.createElement('Icon', props);
  return new Proxy({}, { get: () => Icon });
});

jest.mock('expo-file-system', () => ({
  cacheDirectory: '/tmp/',
  getInfoAsync: jest.fn().mockResolvedValue({ exists: false }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(true),
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/tmp/test.mp3' }),
}));

jest.mock('@/services/playerService.web', () => ({
  setupPlayer: jest.fn(),
  addQueue: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  next: jest.fn(),
  previous: jest.fn(),
  skipToIndex: jest.fn(),
  setVolume: jest.fn(),
  seek: jest.fn(),
}));

jest.mock('@/services/cache', () => ({
  cachedFetch: jest.fn(),
  clearCache: jest.fn(),
  clearExpired: jest.fn().mockReturnValue(0),
  cacheStats: jest.fn().mockReturnValue({ memoryEntries: 0, diskEntries: 0 }),
  downloadToCache: jest.fn().mockImplementation((id, url) => Promise.resolve(url)),
  setCacheTTL: jest.fn(),
}));

jest.mock('@/services/data', () => ({
  useAlbums: () => ({ data: [], loading: false, error: null, reload: jest.fn().mockResolvedValue([]) }),
  useArtists: () => ({ data: [], loading: false, error: null, reload: jest.fn().mockResolvedValue([]) }),
  usePlaylists: () => ({ data: [], loading: false, error: null, reload: jest.fn().mockResolvedValue([]) }),
  useSongs: () => ({ data: [], loading: false, error: null, reload: jest.fn().mockResolvedValue([]) }),
  useSearch: () => ({ data: { songs: [], albums: [], artists: [] }, loading: false }),
  useAlbum: () => ({ data: null, loading: false, error: null }),
  useArtist: () => ({ data: null, loading: false, error: null }),
  usePlaylist: () => ({ data: null, loading: false, error: null }),
  loadAll: jest.fn(),
  reloadAll: jest.fn(),
}));

jest.mock('@/components/Toast', () => ({
  ToastProvider: ({ children }) => children,
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
}));

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve(''),
  headers: { get: () => null },
  status: 200,
});

global.localStorage = {
  getItem: jest.fn(() => null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  get length() { return 0; },
  key: jest.fn(() => null),
};
