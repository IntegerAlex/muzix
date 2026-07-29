import { useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ScrollView, Pressable, View, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'tamagui';
import { Music, ChevronLeft, Share2, Shuffle, Play } from 'lucide-react-native';
import { Interactive } from 'interactkit';
import { GlassCard } from '@/components/GlassCard';
import { RADIUS } from '@/lib/sizing';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { Skeleton, SongSkeleton } from '@/components/Skeleton';
import { useAlbum, useSongs } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import type { Song } from '@/services/types';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT } from '@/lib/colors';

function AlbumSkeletonView() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: 64, paddingBottom: 100 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
          <Skeleton width={200} height={200} borderRadius={RADIUS.xxl} />
          <Skeleton width={160} height={24} borderRadius={6} style={{ marginTop: 20 }} />
          <Skeleton width={140} height={14} borderRadius={4} style={{ marginTop: 8 }} />
          <Skeleton width={80} height={12} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
        <GlassCard padding={16} style={{ marginHorizontal: 20, marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={80} height={16} borderRadius={4} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Skeleton width={100} height={36} borderRadius={9999} />
            <Skeleton width={100} height={36} borderRadius={9999} />
          </View>
        </GlassCard>
        <View style={{ marginTop: 16 }}>
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
  const { data: album, loading, error } = useAlbum(id);
  const { data: allSongs } = useSongs();
  const current = usePlayerStore((s) => s.current);
  const playSong = usePlayerStore((s) => s.playSong);

  const songs = useMemo(() => {
    if (!album) return [];
    return allSongs.filter((s) => album.songIds.includes(s.id));
  }, [allSongs, album]);

  const handlePlayAll = useCallback(() => {
    if (songs.length === 0) return;
    playSong(songs[0], songs, 0);
  }, [songs, playSong]);

  const handleShuffle = useCallback(() => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playSong(shuffled[0], shuffled, 0);
  }, [songs, playSong]);

  const handleShare = useCallback(async () => {
    if (!album) return;
    try {
      await Share.share({
        message: `Check out "${album.title}" by ${album.artist} on Muzix`,
      });
    } catch {}
  }, [album]);

  if (loading) {
    return <AlbumSkeletonView />;
  }

  if (!album) {
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
          {error ?? 'Album not found'}
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 64 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ position: 'relative', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ position: 'relative', height: 200, width: 200 }}>
            <Artwork source={album.imageUrl ? { uri: album.imageUrl } : undefined} colors={album.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={RADIUS.xxl} />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
              locations={[0.5, 1]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.xxl }}
            />
          </View>
          <Text style={{ marginTop: 20, textAlign: 'center' }} fontSize={24} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY} numberOfLines={2}>
            {album.title}
          </Text>
          <Text style={{ marginTop: 4 }} fontSize={13} fontWeight="500" color={TEXT_SECONDARY}>
            Album · {album.artist}
          </Text>
          <Text style={{ marginTop: 2 }} fontSize={12} fontWeight="500" color={TEXT_MUTED}>
            {album.year} · {album.genre}
          </Text>
        </View>

        <GlassCard padding={16} style={{ marginHorizontal: 20, marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text fontSize={13} fontWeight="500" color={TEXT_SECONDARY}>{songs.length} songs</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={handleShare} style={{ borderRadius: 9999, backgroundColor: '#2c2c2e', paddingHorizontal: 12, paddingVertical: 10 }} accessibilityLabel="Share album" accessibilityRole="button">
              <Share2 size={14} color={TEXT_PRIMARY} />
            </Pressable>
            <Pressable
              onPress={handleShuffle}
              style={{ borderRadius: 9999, backgroundColor: '#2c2c2e', paddingHorizontal: 16, paddingVertical: 10 }}
              accessibilityLabel="Shuffle album"
              accessibilityRole="button"
            >
              <Shuffle size={14} color={TEXT_PRIMARY} />
            </Pressable>
            <Interactive click={{ sound: "bubble-pop-01", volume: 0.6 }}>
              <Pressable
                onPress={() => { if (songs.length === 0) return; playSong(songs[0], songs, 0); }}
                style={{ borderRadius: 9999, backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 10 }}
                accessibilityLabel="Play album"
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text fontSize={13} fontWeight="700" color="black">Play</Text>
              </Pressable>
            </Interactive>
          </View>
        </GlassCard>

        <View style={{ marginTop: 16, paddingHorizontal: 4 }}>
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
