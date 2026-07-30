import { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, ScrollView, Pressable, View, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'tamagui';
import { Music, ChevronLeft, Share2, Shuffle } from '@/lib/icons';

import { GlassCard } from '@/components/GlassCard';
import { RADIUS } from '@/lib/sizing';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { Skeleton, SongSkeleton } from '@/components/Skeleton';
import { useAlbum, useSongs } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import { useSharing } from '@/hooks/useSharing';
import { useToast } from '@/components/Toast';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

function AlbumSkeletonView() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: 64, paddingBottom: 100 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: SPACING.xl }}>
          <Skeleton width={200} height={200} borderRadius={RADIUS.xxl} />
          <Skeleton width={160} height={24} borderRadius={6} style={{ marginTop: SPACING.xl }} />
          <Skeleton width={140} height={14} borderRadius={4} style={{ marginTop: 8 }} />
          <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
        <GlassCard padding={SPACING.lg} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={80} height={16} borderRadius={4} />
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <Skeleton width={100} height={36} borderRadius={9999} />
            <Skeleton width={100} height={36} borderRadius={9999} />
          </View>
        </GlassCard>
        <View style={{ marginTop: SPACING.lg }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <SongSkeleton key={i} />
          ))}
        </View>
      </View>
    </View>
  );
}

export default function AlbumDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: album, loading, error, refetch } = useAlbum(id);
  const { data: allSongs } = useSongs();
  const current = usePlayerStore((s) => s.current);
  const playSong = usePlayerStore((s) => s.playSong);
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

  const songs = useMemo(() => {
    if (!album) return [];
    return allSongs.filter((s) => album.songIds.includes(s.id));
  }, [allSongs, album]);

  const handleShuffle = useCallback(() => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled, 0);
  }, [songs, playSong]);

  const handleShare = useCallback(async () => {
    if (!album) return;
    try {
      await share({ contentType: 'album', contentId: album.id, title: album.title, artist: album.artist, imageUrl: album.imageUrl });
      toast('Link copied!', 'success');
    } catch {}
  }, [album, share, toast]);

  if (loading) {
    return <AlbumSkeletonView />;
  }

  if (!album) {
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
        <Text style={{ marginTop: SPACING.lg }} fontSize={15} color={TEXT_MUTED}>
          {error ?? 'Album not found'}
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#1DB954" />}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 64 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ position: 'relative', alignItems: 'center', paddingHorizontal: SPACING.xl }}>
          <View style={{ position: 'relative', height: 200, width: 200 }}>
            <Artwork source={album.imageUrl ? { uri: album.imageUrl } : undefined} colors={album.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={RADIUS.xxl} />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
              locations={[0.5, 1]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.xxl }}
            />
          </View>
          <Text style={{ marginTop: SPACING.xl, textAlign: 'center' }} fontSize={24} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY} numberOfLines={2}>
            {album.title}
          </Text>
          <Text style={{ marginTop: SPACING.xs }} fontSize={13} fontWeight="500" color={TEXT_SECONDARY}>
            Album · {album.artist}
          </Text>
          <Text style={{ marginTop: SPACING.xs }} fontSize={12} fontWeight="500" color={TEXT_MUTED}>
            {album.year} · {album.genre}
          </Text>
        </View>

        <GlassCard padding={SPACING.lg} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text fontSize={13} fontWeight="500" color={TEXT_SECONDARY}>{songs.length} songs</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={handleShare} disabled={isSharing} style={{ borderRadius: 9999, backgroundColor: '#242424', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }} accessibilityLabel="Share album" accessibilityRole="button">
              {isSharing ? <ActivityIndicator size={14} color={TEXT_PRIMARY} /> : <Share2 size={14} color={TEXT_PRIMARY} />}
            </Pressable>
            <Pressable
              onPress={handleShuffle}
              style={{ borderRadius: 9999, backgroundColor: '#242424', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }}
              accessibilityLabel="Shuffle album"
              accessibilityRole="button"
            >
              <Shuffle size={14} color={TEXT_PRIMARY} />
            </Pressable>
              <Pressable
                onPress={() => { if (songs.length === 0) return; playSong(songs[0], songs, 0); }}
                style={{ borderRadius: 9999, backgroundColor: 'white', paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.sm }}
                accessibilityLabel="Play album"
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text fontSize={13} fontWeight="700" color="black">Play</Text>
              </Pressable>
          </View>
        </GlassCard>

        <View style={{ marginTop: SPACING.lg, paddingHorizontal: SPACING.xs }}>
          {songs.map((song, index) => (
            <SongRow
              key={song.id}
              song={song}
              index={index}
              queue={songs}
              isCurrent={current?.id === song.id}
            />
          ))}
          {songs.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Music size={40} color={TEXT_MUTED} strokeWidth={1.5} />
              <Text style={{ marginTop: 12 }} fontSize={14} color={TEXT_MUTED}>No songs in this album</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
