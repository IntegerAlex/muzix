import { memo, useMemo, useState, useCallback } from 'react';
import { Pressable, ScrollView, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, XStack, YStack } from 'tamagui';
import { Artwork } from '@/components/Artwork';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton, CardSkeleton } from '@/components/Skeleton';
import { useAlbums, reloadAll } from '@/services/data';
import { api } from '@/services/api';
import type { Album } from '@/services/types';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { SPACING } from '@/lib/spacing';
import { TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT } from '@/lib/colors';

function prefetchAlbum(id: string): void {
  api.album(id).catch(() => {});
}

const GENRES = [
  { title: 'Pop', colors: ['#ec4899', '#ec4899'] as [string, string] },
  { title: 'Hip-Hop', colors: ['#f59e0b', '#f59e0b'] as [string, string] },
  { title: 'Rock', colors: ['#ef4444', '#ef4444'] as [string, string] },
  { title: 'Electronic', colors: ['#06b6d4', '#06b6d4'] as [string, string] },
  { title: 'R&B', colors: ['#8b5cf6', '#8b5cf6'] as [string, string] },
  { title: 'Jazz', colors: ['#d97706', '#d97706'] as [string, string] },
  { title: 'Classical', colors: ['#10b981', '#10b981'] as [string, string] },
  { title: 'Indie', colors: ['#f43f5e', '#f43f5e'] as [string, string] },
  { title: 'Latin', colors: ['#fb923c', '#fb923c'] as [string, string] },
  { title: 'Country', colors: ['#84cc16', '#84cc16'] as [string, string] },
  { title: 'K-Pop', colors: ['#a855f7', '#a855f7'] as [string, string] },
  { title: 'Podcasts', colors: ['#6366f1', '#6366f1'] as [string, string] },
];

const GenreCard = memo(function GenreCard({ genre }: { genre: typeof GENRES[0] }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/search?q=${encodeURIComponent(genre.title)}`)}
      style={{ width: '47%', overflow: 'hidden', borderRadius: 20 }}
      accessibilityLabel={genre.title}
      accessibilityRole="button"
    >
      <View style={{ position: 'relative', height: 100, width: '100%' }}>
        <Artwork colors={genre.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={0} />
        <LinearGradient
          colors={['rgba(255,255,255,0.15)', 'rgba(0,0,0,0.2)']}
          locations={[0, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text fontSize={17} fontWeight="700" letterSpacing={-0.4} color={TEXT_PRIMARY}>
            {genre.title}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const FeaturedCard = memo(function FeaturedCard({ album }: { album: Album }) {
   const router = useRouter();
   return (
    <Pressable
      onPress={() => router.push(`/album/${album.id}`)}
      onLongPress={() => prefetchAlbum(album.id)}
      onHoverIn={() => prefetchAlbum(album.id)}
      style={{ width: 280, overflow: 'hidden', borderRadius: 20 }}
      accessibilityLabel={`${album.title} by ${album.artist}`}
      accessibilityRole="button"
    >
      <View style={{ position: 'relative', height: 170, width: '100%' }}>
        <Artwork colors={album.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={0} />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
          locations={[0.3, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <YStack style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 20 }}>
          <Text fontSize={17} fontWeight="700" letterSpacing={-0.4} color={TEXT_PRIMARY} numberOfLines={1}>
            {album.title}
          </Text>
          <Text style={{ marginTop: 2 }} fontSize={12} fontWeight="500" color={TEXT_SECONDARY}>
            Album · {album.artist}
          </Text>
        </YStack>
      </View>
    </Pressable>
  );
});

const ChartCard = memo(function ChartCard({ album }: { album: Album }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/album/${album.id}`)}
      style={{ width: 155 }}
      accessibilityLabel={`${album.title} by ${album.artist}`}
      accessibilityRole="button"
    >
      <Artwork colors={album.colors} style={{ height: 155, width: 155 }} radius={20} />
        <Text style={{ marginTop: SPACING.md }} fontSize={13} fontWeight="700" color={TEXT_PRIMARY} numberOfLines={1}>
        {album.title}
      </Text>
      <Text style={{ marginTop: 2 }} fontSize={11} fontWeight="500" color={TEXT_SECONDARY} numberOfLines={1}>
        {album.artist}
      </Text>
    </Pressable>
  );
});

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
      <Text style={{ fontSize: 15, color: TEXT_MUTED, textAlign: 'center', marginBottom: 16 }}>{message}</Text>
      <Pressable
        onPress={onRetry}
        style={{ backgroundColor: ACCENT, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 10 }}
        accessibilityLabel="Retry loading"
        accessibilityRole="button"
      >
        <Text style={{ fontSize: 14, fontWeight: '700', color: 'white' }}>Retry</Text>
      </Pressable>
    </View>
  );
}

export default function BrowseScreen() {
  const { data: albums, loading, error, refetch: reload } = useAlbums();
  const featured = useMemo(() => albums.slice(0, 3), [albums]);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reloadAll();
    reload();
    setTimeout(() => setRefreshing(false), 1000);
  }, [reload]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 96, paddingTop: 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <Text style={{ paddingHorizontal: 20 }} fontSize={28} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY}>
          Browse
        </Text>

        {error ? (
          <ErrorView message={error} onRetry={onRefresh} />
        ) : (
          <>
            <SectionHeader title="Featured" />
            {loading ? (
              <View style={{ flexDirection: 'row', gap: 12, paddingLeft: 20, paddingRight: 20 }}>
                {[1, 2, 3].map((i) => <Skeleton key={i} width={280} height={170} borderRadius={20} />)}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingLeft: 20, paddingRight: 20 }}
              >
                {featured.map((album, i) => (
                  <AnimatedEntrance key={album.id} index={i}>
                    <FeaturedCard album={album} />
                  </AnimatedEntrance>
                ))}
              </ScrollView>
            )}

            <SectionHeader title="Browse by genre" />
            <View style={{ paddingHorizontal: 20 }}>
              <XStack flexWrap="wrap" gap={12}>
                {GENRES.map((genre, i) => (
                  <AnimatedEntrance key={genre.title} index={i}>
                    <GenreCard genre={genre} />
                  </AnimatedEntrance>
                ))}
              </XStack>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
