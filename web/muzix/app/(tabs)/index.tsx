import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Pressable, ScrollView, View, RefreshControl } from 'react-native';
import * as Location from 'expo-location';
import { Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudLightning, CloudSnow, CloudFog, Music2, WifiOff, Angry, Grinning, Happy as HappyIcon, Kissing, Neutral, Pensive, Relieved, Smile, Wink } from '@/lib/icons';
import { Text } from 'tamagui';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { SongSkeleton } from '@/components/Skeleton';
import { useHome } from '@/services/data';
import { getSongsByIds } from '@/services/data';
import { useSharing } from '@/hooks/useSharing';
import { useToast } from '@/components/Toast';
import { useConnectivity } from '@/hooks/useConnectivity';
import { getDownloadedSongs } from '@/services/audioCache';
import type { Song } from '@/services/types';
import { usePlayerStore } from '@/store/playerStore';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER, BG } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

const MOOD_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  Happy: HappyIcon,
  Energetic: Grinning,
  Intense: Angry,
  Rebellious: Angry,
  Relaxed: Relieved,
  Soulful: Smile,
  Calm: Neutral,
  Confident: Smile,
  Smooth: Wink,
  Gentle: Smile,
  Easy: Relieved,
  Creative: Wink,
  Thoughtful: Pensive,
  Chill: Relieved,
  Groovy: Grinning,
  Passionate: Kissing,
};

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: SPACING.xl }}>
      <Text style={{ fontSize: 15, color: TEXT_MUTED, textAlign: 'center', marginBottom: 16 }}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={{ backgroundColor: ACCENT, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.sm }}
        accessibilityLabel="Retry loading"
        accessibilityRole="button"
      >
          <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

function SectionEmpty({ label }: { label: string }) {
  return (
    <View style={{ paddingHorizontal: SPACING.xl, paddingVertical: SPACING.lg, alignItems: 'center' }}>
      <Text fontSize={13} color={TEXT_MUTED}>{label}</Text>
    </View>
  );
}

function OfflineEmptyView({ downloadedSongs, onShare, isSharing, current }: { downloadedSongs: Song[]; onShare: (song: Song) => void; isSharing: boolean; current: Song | null }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: SPACING.xl, paddingTop: 40 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(99,102,241,0.12)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)', alignItems: 'center', justifyContent: 'center' }}>
        <WifiOff size={32} color="#6366f1" />
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY, marginTop: 16 }}>You're offline</Text>
      <Text style={{ fontSize: 14, color: TEXT_SECONDARY, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
        Connect to the internet to discover new music, or check your downloaded tracks.
      </Text>

      {downloadedSongs.length > 0 && (
        <View style={{ alignSelf: 'stretch', marginTop: 24 }}>
          <SectionHeader title="Downloaded" />
          <View>
            {downloadedSongs.map((songItem, i) => (
              <AnimatedEntrance key={songItem.id} index={i}>
                <SongRow
                  song={songItem}
                  index={i}
                  queue={downloadedSongs}
                  isCurrent={current?.id === songItem.id}
                  onShare={onShare}
                  isSharing={isSharing}
                />
              </AnimatedEntrance>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const TimeWeatherMoodGrid = memo(function TimeWeatherMoodGrid({ mood, weatherData }: { mood: { label: string; color: string }; weatherData: { icon: React.ComponentType<{ size: number; color: string }>; label: string; color: string; temp?: string } | null }) {
  const MoodIcon = MOOD_ICONS[mood.label] ?? Music2;
  const w = useMemo(
    () =>
      weatherData || {
        icon: (() => {
          const h = new Date().getHours();
          return h >= 6 && h < 18 ? Sun : Moon;
        })(),
        label: '...',
        color: '#6b7280',
      },
    [weatherData]
  );
  const WeatherIcon = w.icon;
  const timeStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, []);
  const dateStr = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  return (
    <View style={{ marginTop: SPACING.xxl, marginHorizontal: SPACING.xl }}>
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        <View style={{ flex: 1, height: 100, borderRadius: RADIUS.lg, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, padding: SPACING.md, justifyContent: 'space-between' }}>
          <Text fontSize={11} fontWeight="600" color={TEXT_MUTED} textTransform="uppercase" letterSpacing={0.5}>Time</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <Text fontSize={28} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY}>{timeStr}</Text>
            <Text fontSize={12} fontWeight="500" color={TEXT_SECONDARY}>{dateStr}</Text>
          </View>
        </View>
        <View style={{ flex: 1, height: 100, borderRadius: RADIUS.lg, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, padding: SPACING.md, justifyContent: 'space-between' }}>
          <Text fontSize={11} fontWeight="600" color={TEXT_MUTED} textTransform="uppercase" letterSpacing={0.5}>Weather</Text>
          <View style={{ alignItems: 'flex-end', justifyContent: 'flex-end', flex: 1 }}>
            <WeatherIcon size={24} color={w.color} />
            <Text style={{ marginTop: 4 }} fontSize={13} fontWeight="700" color={w.color}>
              {w.temp ? `${w.label} ${w.temp}` : w.label}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
        <View style={{ flex: 1, height: 100, borderRadius: RADIUS.lg, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, padding: SPACING.md, justifyContent: 'space-between' }}>
          <Text fontSize={11} fontWeight="600" color={TEXT_MUTED} textTransform="uppercase" letterSpacing={0.5}>Mood</Text>
          <View style={{ alignItems: 'flex-end' }}>
            <MoodIcon size={32} color={mood.color} />
            <Text style={{ marginTop: 4 }} fontSize={13} fontWeight="700" color={mood.color}>{mood.label}</Text>
          </View>
        </View>
        <View style={{ flex: 1, height: 100, borderRadius: RADIUS.lg, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER, padding: SPACING.md, justifyContent: 'space-between' }} />
      </View>
    </View>
  );
});

function mapApiSongToSong(item: any): Song {
  return {
    id: String(item.id),
    title: item.title ?? 'Unknown',
    artist: item.artist ?? 'Unknown',
    artistId: item.artistId ?? '',
    album: item.album ?? '',
    albumId: item.albumId ?? '',
    genre: item.genre ?? '',
    duration: item.duration ?? '',
    durationMs: item.durationMs ?? item.duration_ms ?? 0,
    track: item.track ?? undefined,
    colors: item.colors ?? ['#6d28d9', '#db2777'],
    lyrics: item.lyrics ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
    audioUrl: item.audioUrl ?? undefined,
  };
}

export default function HomeScreen() {
  const current = usePlayerStore((s) => s.current);
  const recentlyPlayedIds = usePlayerStore((s) => s.recentlyPlayed);
  const { data: homeData, loading, error, refetch: reloadHome } = useHome();
  const { share, isSharing, shareError, resetError } = useSharing();
  const { toast } = useToast();
  const { isOffline } = useConnectivity();
  const [downloadedSongs, setDownloadedSongs] = useState<Song[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOffline) return;
    getDownloadedSongs()
      .then((ids) => {
        if (!cancelled) setDownloadedSongs(getSongsByIds(ids));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOffline]);

  useEffect(() => {
    if (shareError) {
      toast(shareError, 'error');
      resetError();
    }
  }, [shareError]);

  const [refreshing, setRefreshing] = useState(false);
  const [weatherData, setWeatherData] = useState<{ icon: React.ComponentType<{ size: number; color: string }>; label: string; color: string; temp?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          const h = new Date().getHours();
          const isDay = h >= 6 && h < 18;
          setWeatherData({
            icon: isDay ? Sun : Moon,
            label: isDay ? 'Sunny' : 'Clear',
            color: isDay ? '#f59e0b' : '#8b5cf6',
          });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        if (cancelled) return;
        const res = await fetch(`https://wttr.in/${pos.coords.latitude},${pos.coords.longitude}?format=j1`, { signal: controller.signal });
        if (cancelled) return;
        const json = await res.json();
        const cond = json.current_condition?.[0];
        if (!cond) throw new Error('No weather data');
        const code = parseInt(cond.weatherCode);
        const desc = cond.weatherDesc?.[0]?.value || 'Unknown';
        const temp = cond.temp_C ? `${cond.temp_C}°C` : undefined;
        const isDay = cond.observation_time ? true : new Date().getHours() >= 6 && new Date().getHours() < 18;

        let Icon: React.ComponentType<{ size: number; color: string }>;
        let color: string;
        if (code === 113) { Icon = isDay ? Sun : Moon; color = isDay ? '#f59e0b' : '#8b5cf6'; }
        else if (code === 116) { Icon = isDay ? CloudSun : CloudMoon; color = '#94a3b8'; }
        else if (code === 119 || code === 122) { Icon = Cloud; color = '#64748b'; }
        else if (code >= 176 && code <= 200) { Icon = CloudRain; color = '#3b82f6'; }
        else if (code === 200 || (code >= 386 && code <= 392)) { Icon = CloudLightning; color = '#6366f1'; }
        else if ((code >= 179 && code <= 193) || (code >= 227 && code <= 260)) { Icon = CloudSnow; color = '#e2e8f0'; }
        else if (code === 143 || (code >= 248 && code <= 260)) { Icon = CloudFog; color = '#94a3b8'; }
        else { Icon = isDay ? CloudSun : CloudMoon; color = '#94a3b8'; }

        setWeatherData({ icon: Icon, label: desc, color, temp });
      } catch {
        if (!cancelled) {
          const h = new Date().getHours();
          const isDay = h >= 6 && h < 18;
          setWeatherData({
            icon: isDay ? Sun : Moon,
            label: isDay ? 'Sunny' : 'Clear',
            color: isDay ? '#f59e0b' : '#8b5cf6',
          });
        }
      }
    })();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reloadHome().finally(() => setRefreshing(false));
  }, [reloadHome]);

  const handleShare = useCallback(async (song: Song) => {
    try {
      await share({ contentType: 'song', contentId: song.id, title: song.title, artist: song.artist, imageUrl: song.imageUrl });
      toast('Link copied!', 'success');
    } catch {}
  }, [share, toast]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const recentSongs = useMemo(() => {
    if (isOffline) return getSongsByIds(recentlyPlayedIds).slice(0, 5);
    if (!homeData?.recentActivity) return [];
    return homeData.recentActivity
      .filter((item) => item.song)
      .map((item) => mapApiSongToSong(item.song!));
  }, [homeData?.recentActivity, isOffline, recentlyPlayedIds]);

  const topPicks = useMemo(() => {
    if (isOffline) return downloadedSongs;
    if (!homeData?.topPicks) return [];
    return homeData.topPicks.map(mapApiSongToSong);
  }, [homeData?.topPicks, isOffline, downloadedSongs]);

  const showOfflineEmpty = isOffline && recentSongs.length === 0;

  const mood = homeData?.mood ?? { label: 'Neutral', color: '#6b7280' };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 96, paddingTop: 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <Text style={{ paddingHorizontal: SPACING.xl, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: TEXT_PRIMARY }}>
          {greeting}
        </Text>

        {isOffline && !showOfflineEmpty && (
          <View style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.md, backgroundColor: 'rgba(99,102,241,0.12)', borderColor: '#6366f1', borderWidth: 1, borderRadius: RADIUS.md, padding: SPACING.md }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#a5b4fc' }}>
              Offline mode — showing downloaded and recently played tracks.
            </Text>
          </View>
        )}

        {showOfflineEmpty ? (
          <OfflineEmptyView downloadedSongs={downloadedSongs} onShare={handleShare} isSharing={isSharing} current={current} />
        ) : !isOffline && error && !recentSongs.length ? (
          <ErrorView message={error} onRetry={onRefresh} />
        ) : (
          <>
            <TimeWeatherMoodGrid mood={mood} weatherData={weatherData} />

            {recentSongs.length > 0 && (
              <>
                <SectionHeader title="Recently played" />
                <View style={{ paddingHorizontal: SPACING.xl }}>
                  {recentSongs.slice(0, 5).map((songItem, i) => (
                    <AnimatedEntrance key={songItem.id} index={i}>
                      <SongRow
                        song={songItem}
                        index={i}
                        queue={recentSongs}
                        isCurrent={current?.id === songItem.id}
                        onShare={handleShare}
                        isSharing={isSharing}
                      />
                    </AnimatedEntrance>
                  ))}
                </View>
              </>
            )}

            <SectionHeader title={isOffline ? 'Downloaded' : 'Top picks for you'} />
            <View style={{ paddingHorizontal: SPACING.xl }}>
              {loading && !isOffline ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => <SongSkeleton key={i} />)}
                </>
              ) : topPicks.length > 0 ? (
                topPicks.map((songItem, i) => (
                  <AnimatedEntrance key={songItem.id} index={i}>
                    <SongRow
                      song={songItem}
                      index={i}
                      queue={topPicks}
                      isCurrent={current?.id === songItem.id}
                      onShare={handleShare}
                      isSharing={isSharing}
                    />
                  </AnimatedEntrance>
                ))
              ) : (
                <SectionEmpty label={isOffline ? 'No downloaded tracks yet. Download songs while online to play them here.' : 'No recommendations available'} />
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
