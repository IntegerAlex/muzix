import { useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { FlatList, ScrollView, Pressable, View } from 'react-native';
import { Text } from 'tamagui';
import { Music, ChevronLeft, UserPlus, UserCheck } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { RADIUS } from '@/lib/sizing';
import { SPACING } from '@/lib/spacing';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton, SongSkeleton, CardSkeleton } from '@/components/Skeleton';
import { useArtist, useAlbums, useSongs } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT } from '@/lib/colors';

function ArtistSkeletonView() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: 64, paddingBottom: 100 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
          <Skeleton width={160} height={160} borderRadius={9999} />
          <Skeleton width={140} height={24} borderRadius={6} style={{ marginTop: 20 }} />
        </View>
        <GlassCard padding={16} style={{ marginHorizontal: 20, marginTop: 24 }}>
          <Skeleton width={80} height={12} borderRadius={4} />
          <View style={{ marginTop: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SongSkeleton key={i} />
            ))}
          </View>
        </GlassCard>
        <View style={{ marginTop: 28, paddingHorizontal: 20 }}>
          <Skeleton width={80} height={20} borderRadius={6} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, marginTop: 12 }}>
          {[0, 1].map((i) => (
            <CardSkeleton key={i} width={155} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function ArtistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: artist, loading, error } = useArtist(id);
  const { data: allAlbums } = useAlbums();
  const { data: allSongs } = useSongs();
  const current = usePlayerStore((s) => s.current);
  const [isFollowing, setIsFollowing] = useState(false);

  const popular = useMemo(() => {
    if (!artist) return [];
    return allSongs.filter((s) => s.artistId === artist.id).slice(0, 5);
  }, [allSongs, artist]);

  const artistAlbums = useMemo(() => {
    if (!artist) return [];
    return allAlbums.filter((a) => artist.albumIds.includes(a.id));
  }, [allAlbums, artist]);

  const toggleFollow = useCallback(() => {
    setIsFollowing((prev) => !prev);
  }, []);

  if (loading) {
    return <ArtistSkeletonView />;
  }

  if (!artist) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <Pressable
          onPress={() => router.back()}
          style={{ position: 'absolute', top: 56, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={22} color={TEXT_PRIMARY} />
        </Pressable>
        <Music size={48} color={TEXT_MUTED} strokeWidth={1.5} />
        <Text style={{ marginTop: 16 }} fontSize={15} color={TEXT_MUTED}>
          {error ?? 'Artist not found'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Pressable
        onPress={() => router.back()}
        style={{ position: 'absolute', top: 56, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' }}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ChevronLeft size={22} color={TEXT_PRIMARY} />
      </Pressable>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingTop: 64 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
          <Artwork colors={artist.colors} style={{ height: 160, width: 160 }} radius={9999} />
          <Text style={{ marginTop: 20, textAlign: 'center' }} fontSize={24} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY} numberOfLines={2}>
            {artist.name}
          </Text>
          <Pressable
            onPress={toggleFollow}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, borderRadius: 9999, backgroundColor: isFollowing ? ACCENT : '#2c2c2e', paddingHorizontal: 20, paddingVertical: 8 }}
            accessibilityLabel={isFollowing ? 'Unfollow artist' : 'Follow artist'}
            accessibilityRole="button"
          >
            {isFollowing ? (
              <UserCheck size={14} color="white" />
            ) : (
              <UserPlus size={14} color={TEXT_PRIMARY} />
            )}
            <Text fontSize={13} fontWeight="500" color={isFollowing ? 'white' : TEXT_PRIMARY}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </Pressable>
        </View>

        <GlassCard padding={16} style={{ marginHorizontal: 20, marginTop: 24 }}>
           <Text fontSize={11} fontWeight="700" textTransform="uppercase" letterSpacing={2} color={TEXT_MUTED}>
             Popular
           </Text>
           {popular.length === 0 ? (
             <View style={{ marginTop: 8, alignItems: 'center', paddingVertical: 16 }}>
               <Music size={24} color={TEXT_MUTED} strokeWidth={1.5} />
               <Text style={{ marginTop: 8 }} fontSize={14} color={TEXT_MUTED}>No popular songs</Text>
             </View>
           ) : (
             <FlatList
               data={popular}
               keyExtractor={(item) => item.id}
               initialNumToRender={20}
               maxToRenderPerBatch={10}
               windowSize={5}
               removeClippedSubviews
               scrollEnabled={false}
               renderItem={({ item, index }) => (
                 <SongRow
                   song={item}
                   index={index}
                   queue={popular}
                   isCurrent={current?.id === item.id}
                   subtitle={item.album}
                 />
               )}
             />
           )}
         </GlassCard>

        <SectionHeader title="Albums" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 }}>
          {artistAlbums.length === 0 ? (
            <View style={{ width: '100%', alignItems: 'center', paddingVertical: 24 }}>
              <Music size={32} color={TEXT_MUTED} strokeWidth={1.5} />
              <Text style={{ marginTop: 8 }} fontSize={14} color={TEXT_MUTED}>No albums by this artist</Text>
            </View>
          ) : (
            artistAlbums.map((album) => (
              <Pressable
                key={album.id}
                onPress={() => router.push(`/album/${album.id}`)}
                style={{ width: '47%' }}
                accessibilityLabel={`${album.title}, ${album.year}`}
                accessibilityRole="button"
              >
                <Artwork colors={album.colors} style={{ height: 160, width: '100%' }} radius={20} />
                <Text style={{ marginTop: SPACING.md }} fontSize={13} fontWeight="700" color={TEXT_PRIMARY} numberOfLines={1}>
                  {album.title}
                </Text>
                <Text style={{ marginTop: SPACING.xs, fontSize: 11, fontWeight: '500', color: TEXT_SECONDARY }}>{album.year}</Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
