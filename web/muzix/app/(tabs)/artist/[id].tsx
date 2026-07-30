import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, FlatList, ScrollView, Pressable, View, RefreshControl } from 'react-native';
import { Text } from 'tamagui';
import { Music, ChevronLeft, UserPlus, UserCheck, Share2 } from 'lucide-react-native';
import { GlassCard } from '@/components/GlassCard';
import { RADIUS } from '@/lib/sizing';
import { SPACING } from '@/lib/spacing';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton, SongSkeleton, CardSkeleton } from '@/components/Skeleton';
import { useArtist, useAlbums, useSongs } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import { useSharing } from '@/hooks/useSharing';
import { useToast } from '@/components/Toast';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT } from '@/lib/colors';

function ArtistSkeletonView() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: 64, paddingBottom: 100 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: SPACING.xl }}>
          <Skeleton width={160} height={160} borderRadius={9999} />
          <Skeleton width={140} height={24} borderRadius={6} style={{ marginTop: SPACING.xl }} />
        </View>
        <GlassCard padding={SPACING.lg} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xxl }}>
          <Skeleton width={80} height={12} borderRadius={4} />
          <View style={{ marginTop: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <SongSkeleton key={i} />
            ))}
          </View>
        </GlassCard>
        <View style={{ marginTop: SPACING.xxxl, paddingHorizontal: SPACING.xl }}>
          <Skeleton width={80} height={20} borderRadius={6} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingHorizontal: SPACING.xl, marginTop: SPACING.md }}>
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
  const { data: artist, loading, error, refetch } = useArtist(id);
  const { data: allAlbums } = useAlbums();
  const { data: allSongs } = useSongs();
  const current = usePlayerStore((s) => s.current);
  const [isFollowing, setIsFollowing] = useState(false);
  const { share, isSharing, shareError, resetError } = useSharing();
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (shareError) { toast(shareError, 'error'); resetError(); }
  }, [shareError]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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

  const handleShare = useCallback(async () => {
    if (!artist) return;
    try {
      await share({ contentType: 'artist', contentId: artist.id, title: artist.name, imageUrl: artist.imageUrl });
      toast('Link copied!', 'success');
    } catch {}
  }, [artist, share, toast]);

  if (loading) {
    return <ArtistSkeletonView />;
  }

  if (!artist) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG }}>
        <Pressable
          onPress={() => router.back()}
          style={{ position: 'absolute', top: 56, left: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' }}
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
        style={{ position: 'absolute', top: 56, left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: '#242424', alignItems: 'center', justifyContent: 'center' }}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <ChevronLeft size={22} color={TEXT_PRIMARY} />
      </Pressable>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#1DB954" />}
      >
        <View style={{ alignItems: 'center', paddingHorizontal: SPACING.xl }}>
          <Artwork colors={artist.colors} style={{ height: 160, width: 160 }} radius={9999} />
          <Text style={{ marginTop: SPACING.xl, textAlign: 'center' }} fontSize={24} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY} numberOfLines={2}>
            {artist.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md }}>
            <Pressable
              onPress={toggleFollow}
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, borderRadius: 9999, backgroundColor: isFollowing ? ACCENT : '#242424', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm }}
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
            <Pressable
              onPress={handleShare}
              disabled={isSharing}
              style={{ borderRadius: 9999, backgroundColor: '#242424', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}
              accessibilityLabel="Share artist"
              accessibilityRole="button"
            >
              {isSharing ? <ActivityIndicator size={16} color={TEXT_PRIMARY} /> : <Share2 size={16} color={TEXT_PRIMARY} />}
            </Pressable>
          </View>
        </View>

        <GlassCard padding={SPACING.lg} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xxl }}>
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingHorizontal: SPACING.xl }}>
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
