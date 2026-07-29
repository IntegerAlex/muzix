import { memo, useEffect, useMemo, useState, useCallback } from 'react';
import { Link, type Href } from 'expo-router';
import { Pressable, ScrollView, View, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import { Text, YStack } from 'tamagui';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton, SongSkeleton, CardSkeleton } from '@/components/Skeleton';
import { useAlbums, usePlaylists, useSongs, reloadAll } from '@/services/data';
import { api } from '@/services/api';
import type { Album, Playlist, Song } from '@/services/types';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/store/playerStore';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

function prefetchAlbum(id: string): void {
  api.album(id).catch(() => {});
}

function prefetchPlaylist(id: string): void {
  api.playlist(id).catch(() => {});
}

const HeroCard = memo(function HeroCard({ album }: { album: Album }) {
   return (
    <Link href={`/album/${album.id}` as Href} asChild>
      <Pressable
        onLongPress={() => prefetchAlbum(album.id)}
        onHoverIn={() => prefetchAlbum(album.id)}
        style={{ marginHorizontal: SPACING.xl, overflow: 'hidden', borderRadius: 20 }}
        accessibilityLabel={`${album.title} by ${album.artist}`}
        accessibilityRole="button"
      >
        <View style={{ position: 'relative', height: 230, width: '100%' }}>
          <Artwork colors={album.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={0} />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.88)']}
            locations={[0, 0.5, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <YStack style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: SPACING.xl, paddingBottom: SPACING.xxl }}>
            <Text fontSize={11} fontWeight="700" textTransform="uppercase" letterSpacing={2} color={TEXT_SECONDARY}>
              New Release
            </Text>
            <Text style={{ marginTop: SPACING.sm }} fontSize={24} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY}>
              {album.title}
            </Text>
            <Text style={{ marginTop: SPACING.xs }} fontSize={14} fontWeight="500" color={TEXT_SECONDARY}>
              {album.artist} · {album.year}
            </Text>
          </YStack>
        </View>
      </Pressable>
    </Link>
  );
});

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

  const [refreshing, setRefreshing] = useState(false);
  const [topPicks, setTopPicks] = useState<Song[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

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

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

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
    <View style={{ flex: 1 }}>
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
            {albums[0] ? (
              <View style={{ marginTop: SPACING.xxl }}>
                <AnimatedEntrance index={0}>
                  <HeroCard album={albums[0]} />
                </AnimatedEntrance>
              </View>
            ) : (
              <View style={{ marginTop: SPACING.xxl, marginHorizontal: SPACING.xl }}>
                <SectionEmpty label="No featured album right now" />
              </View>
            )}

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
