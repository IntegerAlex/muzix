import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, View, RefreshControl, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { Play, Sun, Moon, Cloud, CloudSun, CloudMoon, CloudRain, CloudLightning, CloudSnow, CloudFog, Zap, Sparkles, Heart, Music2 } from 'lucide-react-native';
import { Text, YStack } from 'tamagui';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton, SongSkeleton, CardSkeleton } from '@/components/Skeleton';
import { useAlbums, usePlaylists, useSongs, reloadAll } from '@/services/data';
import { api } from '@/services/api';
import { useSharing } from '@/hooks/useSharing';
import type { Album, Playlist, Song } from '@/services/types';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/store/playerStore';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER, BG } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

function prefetchAlbum(id: string): void {
  api.album(id).catch((e) => console.error('Failed to prefetch album:', e));
}

function prefetchPlaylist(id: string): void {
  api.playlist(id).catch((e) => console.error('Failed to prefetch playlist:', e));
}

const GENRE_MOODS: Record<string, { label: string; icon: React.ComponentType<{ size: number; color: string }>; color: string }> = {
  pop: { label: 'Happy', icon: SmileHelper, color: '#f59e0b' },
  'k-pop': { label: 'Energetic', icon: Music2, color: '#ec4899' },
  dance: { label: 'Energetic', icon: Zap, color: '#f97316' },
  electronic: { label: 'Energetic', icon: Zap, color: '#06b6d4' },
  edm: { label: 'Energetic', icon: Zap, color: '#3b82f6' },
  rock: { label: 'Intense', icon: FlameHelper, color: '#ef4444' },
  metal: { label: 'Intense', icon: FlameHelper, color: '#dc2626' },
  punk: { label: 'Rebellious', icon: FlameHelper, color: '#e11d48' },
  jazz: { label: 'Relaxed', icon: Cloud, color: '#8b5cf6' },
  blues: { label: 'Soulful', icon: Heart, color: '#6366f1' },
  classical: { label: 'Calm', icon: Cloud, color: '#a855f7' },
  'hip-hop': { label: 'Confident', icon: Music2, color: '#14b8a6' },
  rap: { label: 'Confident', icon: Music2, color: '#10b981' },
  rnb: { label: 'Smooth', icon: Heart, color: '#f43f5e' },
  folk: { label: 'Gentle', icon: Cloud, color: '#84cc16' },
  country: { label: 'Easy', icon: Cloud, color: '#eab308' },
  acoustic: { label: 'Gentle', icon: Cloud, color: '#22c55e' },
  indie: { label: 'Creative', icon: Sparkles, color: '#a855f7' },
  alternative: { label: 'Thoughtful', icon: Sparkles, color: '#7c3aed' },
  ambient: { label: 'Calm', icon: Cloud, color: '#6366f1' },
  'lo-fi': { label: 'Chill', icon: Cloud, color: '#8b5cf6' },
  soul: { label: 'Soulful', icon: Heart, color: '#f43f5e' },
  funk: { label: 'Groovy', icon: Zap, color: '#f97316' },
  reggae: { label: 'Chill', icon: Cloud, color: '#84cc16' },
  latin: { label: 'Passionate', icon: Heart, color: '#ef4444' },
};

function SmileHelper({ size, color }: { size: number; color: string }) {
  return <Text style={{ fontSize: size, color }}>😊</Text>;
}
function FlameHelper({ size, color }: { size: number; color: string }) {
  return <Text style={{ fontSize: size, color }}>🔥</Text>;
}

function deriveMood(recentIds: string[], songs: Song[]): { label: string; icon: React.ComponentType<{ size: number; color: string }>; color: string } {
  const genreCounts = new Map<string, number>();
  for (const id of recentIds) {
    const song = songs.find(s => s.id === id);
    if (!song?.genre) continue;
    const genres = song.genre.toLowerCase().split(/[,/&]/).map(g => g.trim());
    for (const g of genres) {
      genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
    }
  }
  if (genreCounts.size === 0) return { label: 'Neutral', icon: Music2, color: '#6b7280' };
  const topGenre = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (topGenre === 'unknown' || topGenre === '') return { label: 'Chill', icon: Cloud, color: '#6b7280' };
  for (const [key, mood] of Object.entries(GENRE_MOODS)) {
    if (topGenre.includes(key)) return mood;
  }
  return { label: 'Neutral', icon: Music2, color: '#6b7280' };
}

const WideCard = memo(function WideCard({ playlist }: { playlist: Playlist }) {
   return (
    <Link href={`/playlist/${playlist.id}` as Href} asChild>
      <Pressable
        onLongPress={() => prefetchPlaylist(playlist.id)}
        onHoverIn={() => prefetchPlaylist(playlist.id)}
        style={{ width: 280, overflow: 'hidden', borderRadius: RADIUS.lg }}
        accessibilityLabel={playlist.title}
        accessibilityRole="button"
      >
        <View style={{ position: 'relative', height: 170, width: '100%' }}>
          <Artwork colors={playlist.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={0} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
            locations={[0.3, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <YStack style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.lg, paddingBottom: SPACING.xl }}>
            <Text fontSize={17} fontWeight="700" letterSpacing={-0.4} color={TEXT_PRIMARY} numberOfLines={1}>
              {playlist.title}
            </Text>
            <Text style={{ marginTop: SPACING.xs }} fontSize={12} fontWeight="500" color={TEXT_SECONDARY}>
              Playlist · {playlist.songIds.length} songs
            </Text>
          </YStack>
        </View>
      </Pressable>
    </Link>
  );
});

const SquareCard = memo(function SquareCard({ album }: { album: Album }) {
   return (
    <Link href={`/album/${album.id}` as Href} asChild>
      <Pressable
        onLongPress={() => prefetchAlbum(album.id)}
        onHoverIn={() => prefetchAlbum(album.id)}
        style={{ width: '47%' }}
        accessibilityLabel={`${album.title} by ${album.artist}`}
        accessibilityRole="button"
      >
        <Artwork colors={album.colors} style={{ height: 160, width: '100%' }} radius={RADIUS.lg} />
        <Text style={{ marginTop: SPACING.sm }} fontSize={13} fontWeight="700" color={TEXT_PRIMARY} numberOfLines={1}>
          {album.title}
        </Text>
        <Text style={{ marginTop: SPACING.xs }} fontSize={11} fontWeight="500" color={TEXT_SECONDARY} numberOfLines={1}>
          {album.artist}
        </Text>
      </Pressable>
    </Link>
  );
});

const QuickCard = memo(function QuickCard({ album, onPress }: { album: Album; onPress: () => void }) {
   return (
    <Pressable
      onPress={onPress}
      onLongPress={() => prefetchAlbum(album.id)}
      onHoverIn={() => prefetchAlbum(album.id)}
      style={{ flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 16, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER }}
      accessibilityLabel={`Play ${album.title}`}
      accessibilityRole="button"
    >
      <Artwork colors={album.colors} style={{ height: 48, width: 48 }} radius={0} />
      <Text style={{ flex: 1, paddingHorizontal: SPACING.md }} fontSize={13} fontWeight="700" color={TEXT_PRIMARY} numberOfLines={1}>
        {album.title}
      </Text>
      <View style={{ marginRight: SPACING.md, height: 28, width: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: BORDER }}>
        <Play size={12} color={TEXT_PRIMARY} fill={TEXT_PRIMARY} />
      </View>
    </Pressable>
  );
});

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

export default function HomeScreen() {
  const playSong = usePlayerStore((s) => s.playSong);
  const current = usePlayerStore((s) => s.current);
  const { data: albums, loading: albumsLoading, error: albumsError, refetch: reloadAlbums } = useAlbums();
  const { data: playlists, loading: playlistsLoading, error: playlistsError, refetch: reloadPlaylists } = usePlaylists();
  const { data: songs, loading: songsLoading, error: songsError, refetch: reloadSongs } = useSongs();
  const token = useAuthStore((s) => s.token);
  const { share } = useSharing();

  const [refreshing, setRefreshing] = useState(false);
  const [topPicks, setTopPicks] = useState<Song[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

  const [weatherData, setWeatherData] = useState<{ icon: React.ComponentType<{ size: number; color: string }>; label: string; color: string; temp?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
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
        const res = await fetch(`https://wttr.in/${pos.coords.latitude},${pos.coords.longitude}?format=j1`);
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
    return () => { cancelled = true; };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reloadAll();
    Promise.all([reloadAlbums(), reloadPlaylists(), reloadSongs()]).finally(() => {
      setRefreshing(false);
      if (token) {
        setRecommendationsLoading(true);
        setRecommendationsError(null);
        api.recommendations(20, token).then((result) => {
          const items = result.items ?? [];
          setTopPicks(items.map((item: any) => ({
            id: item.id,
            title: item.title,
            artist: item.artist,
            artistId: '',
            album: item.album,
            albumId: '',
            duration: '',
            durationMs: item.duration_ms || 0,
            track: undefined,
            colors: item.colors || ['#6d28d9', '#db2777'],
            lyrics: undefined,
            imageUrl: undefined,
            audioUrl: undefined,
          })));
        }).catch((err) => {
          setRecommendationsError(String(err));
          setTopPicks(songs.slice(0, 6));
        }).finally(() => setRecommendationsLoading(false));
      }
    });
  }, [reloadAlbums, reloadPlaylists, reloadSongs, token, songs]);

  const loading = albumsLoading || playlistsLoading || songsLoading;
  const error = albumsError || playlistsError || songsError;

  const initialLoading = loading && !albums.length && !playlists.length && !songs.length;

  const recentSongs = useMemo(() => songs.slice(0, 6), [songs]);
  const featuredAlbums = useMemo(() => albums.slice(0, 6), [albums]);

  const songIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    songs.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [songs]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  useEffect(() => {
    async function loadRecommendations() {
      if (!token) return;
      setRecommendationsLoading(true);
      setRecommendationsError(null);
      try {
        const result = await api.recommendations(20, token);
        const items = result.items ?? [];
        setTopPicks(items.map((item: any) => ({
          id: item.id,
          title: item.title,
          artist: item.artist,
          artistId: '',
          album: item.album,
          albumId: '',
          duration: '',
          durationMs: item.duration_ms || 0,
          track: undefined,
          colors: item.colors || ['#6d28d9', '#db2777'],
          lyrics: undefined,
          imageUrl: undefined,
          audioUrl: undefined,
        })));
      } catch (err) {
        setRecommendationsError(String(err));
        setTopPicks(songs.slice(0, 6));
      } finally {
        setRecommendationsLoading(false);
      }
    }
    loadRecommendations();
  }, [token]);

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

        {initialLoading ? (
          <View style={{ marginTop: SPACING.xxl }}>
            <View style={{ marginHorizontal: SPACING.xl }}>
              <Skeleton width="100%" height={230} borderRadius={RADIUS.xl} />
            </View>
            <SectionHeader title="Recently played" />
            <View style={{ flexDirection: 'row', gap: SPACING.md, paddingLeft: SPACING.xl, paddingRight: SPACING.xl }}>
              {[1, 2, 3].map((i) => <Skeleton key={i} width={280} height={170} borderRadius={RADIUS.lg} />)}
            </View>
            <SectionHeader title="Top picks for you" />
            <View style={{ paddingHorizontal: SPACING.xl }}>
              {[1, 2, 3, 4, 5].map((i) => <SongSkeleton key={i} />)}
            </View>
          </View>
        ) : error ? (
          <ErrorView message={error} onRetry={onRefresh} />
        ) : (
          <>
            {(() => {
              const recentIds = usePlayerStore.getState().recentlyPlayed;
              const mood = deriveMood(recentIds, songs);
              const w = weatherData || { icon: (() => { const h = new Date().getHours(); return h >= 6 && h < 18 ? Sun : Moon; })(), label: '...', color: '#6b7280' };
              const WeatherIcon = w.icon;
              const MoodIcon = mood.icon;
              const now = new Date();
              const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const dateStr = now.toLocaleDateString([], { month: 'short', day: 'numeric' });

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
                        <WeatherIcon size={32} color={w.color} />
                        {w.temp && <Text style={{ marginTop: 2 }} fontSize={13} fontWeight="700" color={w.color}>{w.temp}</Text>}
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
            })()}

            <SectionHeader title="Recently played" />
            {(() => {
              const recentIds = usePlayerStore.getState().recentlyPlayed;
              const playedSongs = recentIds.map((id) => songIndexMap.has(id) ? songs[songIndexMap.get(id)!] : null).filter(Boolean) as Song[];
              if (playedSongs.length === 0) {
                return <View style={{ marginHorizontal: SPACING.xl }}><SectionEmpty label="No recently played songs" /></View>;
              }
              return (
                <View style={{ paddingHorizontal: SPACING.xl }}>
                  {playedSongs.slice(0, 6).map((songItem, i) => (
                    <AnimatedEntrance key={songItem.id} index={i}>
                      <SongRow
                        song={songItem}
                        index={i}
                        queue={playedSongs}
                        isCurrent={current?.id === songItem.id}
                        onShare={(song) => share({ contentType: 'song', contentId: song.id, title: song.title, artist: song.artist, imageUrl: song.imageUrl })}
                      />
                    </AnimatedEntrance>
                  ))}
                </View>
              );
            })()}

            <SectionHeader title="Top picks for you" />
            <View style={{ paddingHorizontal: SPACING.xl }}>
              {recommendationsLoading ? (
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
                      onShare={(song) => share({ contentType: 'song', contentId: song.id, title: song.title, artist: song.artist, imageUrl: song.imageUrl })}
                    />
                  </AnimatedEntrance>
                ))
              ) : (
                <SectionEmpty label="No recommendations available" />
              )}
            </View>

            <SectionHeader title="Playlists" />
            {playlistsLoading ? (
              <View style={{ flexDirection: 'row', gap: SPACING.md, paddingLeft: SPACING.xl, paddingRight: SPACING.xl }}>
                {[1, 2, 3].map((i) => <Skeleton key={i} width={280} height={170} borderRadius={RADIUS.lg} />)}
              </View>
            ) : playlists.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SPACING.md, paddingLeft: SPACING.xl, paddingRight: SPACING.xl }}
              >
                {playlists.map((pl, i) => (
                  <AnimatedEntrance key={pl.id} index={i}>
                    <WideCard playlist={pl} />
                  </AnimatedEntrance>
                ))}
              </ScrollView>
            ) : (
              <View style={{ marginHorizontal: SPACING.xl }}>
                <SectionEmpty label="No playlists yet" />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
