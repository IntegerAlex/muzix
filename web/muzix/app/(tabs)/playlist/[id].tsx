import { useMemo, useState, useCallback } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { FlatList, ScrollView, Pressable, View, Modal, TextInput, Alert, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from 'tamagui';
import { Music, Plus, Trash2, ChevronLeft, Share2, ListPlus, Play } from 'lucide-react-native';

import { GlassCard } from '@/components/GlassCard';
import { RADIUS } from '@/lib/sizing';
import { SPACING } from '@/lib/spacing';
import { Artwork } from '@/components/Artwork';
import { SongRow } from '@/components/SongRow';
import { Skeleton, SongSkeleton } from '@/components/Skeleton';
import { usePlaylist, useSongs } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import type { Song } from '@/services/types';

function PlaylistSkeletonView() {
  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={{ paddingTop: 64, paddingBottom: 100 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
          <Skeleton width={200} height={200} borderRadius={RADIUS.xxl} />
          <Skeleton width={160} height={24} borderRadius={6} style={{ marginTop: 20 }} />
          <Skeleton width={120} height={14} borderRadius={4} style={{ marginTop: 8 }} />
        </View>
        <GlassCard padding={SPACING.lg} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Skeleton width={100} height={16} borderRadius={4} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Skeleton width={60} height={36} borderRadius={9999} />
            <Skeleton width={60} height={36} borderRadius={9999} />
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

export default function PlaylistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: playlist, loading, error } = usePlaylist(id);
  const { data: allSongs } = useSongs();
  const current = usePlayerStore((s) => s.current);
  const playSong = usePlayerStore((s) => s.playSong);
  const addToQueue = usePlayerStore((s) => s.addToQueue);
  const playNextSong = usePlayerStore((s) => s.playNext);

  const songs = useMemo(() => {
    if (!playlist) return [];
    return allSongs.filter((s) => playlist.songIds.includes(s.id));
  }, [allSongs, playlist]);

  const token = useAuthStore((s) => s.token);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [showAddSongModal, setShowAddSongModal] = useState(false);
  const [playlistSongIds, setPlaylistSongIds] = useState<string[]>([]);
  const [contextSong, setContextSong] = useState<Song | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);

  const playlistSongs = useMemo(() => {
    if (editing) {
      return allSongs.filter((s) => playlistSongIds.includes(s.id));
    }
    return songs;
  }, [editing, allSongs, playlistSongIds, songs]);

  const songsNotInPlaylist = useMemo(() => {
    if (editing) return allSongs.filter((s) => !playlistSongIds.includes(s.id));
    if (!playlist) return [];
    return allSongs.filter((s) => !playlist.songIds.includes(s.id));
  }, [allSongs, editing, playlist, playlistSongIds]);

  const removeSong = useCallback((songId: string) => {
    setPlaylistSongIds((ids) => ids.filter((id) => id !== songId));
  }, []);

  const openContextMenu = useCallback((song: Song) => {
    setContextSong(song);
    setShowContextMenu(true);
  }, []);

  const renderPlaylistSong = useCallback(({ item, index }: { item: Song; index: number }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <SongRow
          song={item}
          index={index}
          queue={playlistSongs}
          isCurrent={current?.id === item.id}
        />
      </View>
      {editing ? (
        <Pressable
          onPress={() => removeSong(item.id)}
          style={{ paddingRight: 16 }}
          accessibilityLabel={`Remove ${item.title}`}
          hitSlop={8}
        >
          <Trash2 size={16} color="#ef4444" />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => openContextMenu(item)}
          style={{ paddingRight: 16 }}
          accessibilityLabel={`Options for ${item.title}`}
          accessibilityRole="button"
        >
          <ListPlus size={16} color={TEXT_MUTED} />
        </Pressable>
      )}
    </View>
  ), [playlistSongs, current, editing, removeSong, openContextMenu]);

  const startEdit = useCallback(() => {
    if (!playlist) return;
    setEditTitle(playlist.title);
    setPlaylistSongIds([...playlist.songIds]);
    setEditing(true);
  }, [playlist]);

  const saveEdit = useCallback(async () => {
    if (!playlist || !token) return;
    try {
      await api.updatePlaylist(playlist.id, editTitle, playlistSongIds, token);
      setEditing(false);
      router.back();
    } catch {}
  }, [playlist, editTitle, playlistSongIds, token]);

  const deletePlaylist = useCallback(async () => {
    if (!playlist || !token) return;
    Alert.alert('Delete Playlist', `Delete "${playlist.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deletePlaylist(playlist.id, token);
            router.back();
          } catch {}
        },
      },
    ]);
  }, [playlist, token]);

  const addSong = useCallback((songId: string) => {
    setPlaylistSongIds((ids) => [...ids, songId]);
    setShowAddSongModal(false);
  }, []);

  const handleShare = useCallback(async () => {
    if (!playlist) return;
    try {
      await Share.share({
        message: `Check out "${playlist.title}" on Muzix — ${songs.length} songs`,
      });
    } catch {}
  }, [playlist, songs.length]);

  const handleContextAction = useCallback((action: 'queue' | 'next') => {
    if (!contextSong) return;
    if (action === 'queue') addToQueue(contextSong);
    else playNextSong(contextSong);
    setShowContextMenu(false);
    setContextSong(null);
  }, [contextSong, addToQueue, playNextSong]);

  if (loading) {
    return <PlaylistSkeletonView />;
  }

  if (!playlist) {
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
          {error ?? 'Playlist not found'}
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

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingTop: 64 }}>
        <View style={{ position: 'relative', alignItems: 'center', paddingHorizontal: 20 }}>
          <View style={{ position: 'relative', height: 200, width: 200 }}>
            <Artwork colors={playlist.colors} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} radius={RADIUS.xxl} />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
              locations={[0.5, 1]}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: RADIUS.xxl }}
            />
          </View>
          <Text style={{ marginTop: 20, textAlign: 'center' }} fontSize={24} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY} numberOfLines={2}>
            {playlist.title}
          </Text>
          <Text style={{ marginTop: 4 }} fontSize={13} fontWeight="500" color={TEXT_SECONDARY}>
            Playlist · {songs.length} songs
          </Text>
        </View>

        <GlassCard padding={SPACING.lg} style={{ marginHorizontal: SPACING.xl, marginTop: SPACING.xxl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {editing ? (
            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              style={{ flex: 1, fontSize: 15, fontWeight: '600', color: TEXT_PRIMARY, backgroundColor: '#242424', borderRadius: 8, padding: 8 }}
            />
          ) : (
            <Text fontSize={15} fontWeight="500" color={TEXT_SECONDARY}>Your playlist</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {editing ? (
              <>
                <Pressable onPress={() => setEditing(false)} style={{ borderRadius: 9999, paddingHorizontal: 16, paddingVertical: 10 }} accessibilityLabel="Cancel editing" accessibilityRole="button">
                  <Text fontSize={13} fontWeight="500" color={TEXT_MUTED}>Cancel</Text>
                </Pressable>
                <Pressable onPress={saveEdit} style={{ borderRadius: 9999, backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 10 }} accessibilityLabel="Save changes" accessibilityRole="button">
                  <Text fontSize={13} fontWeight="700" color="white">Save</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={handleShare} style={{ borderRadius: 9999, backgroundColor: '#242424', paddingHorizontal: 12, paddingVertical: 10 }} accessibilityLabel="Share playlist" accessibilityRole="button">
                  <Share2 size={14} color={TEXT_PRIMARY} />
                </Pressable>
                {token && (
                  <>
                    <Pressable onPress={startEdit} style={{ borderRadius: 9999, backgroundColor: '#242424', paddingHorizontal: 16, paddingVertical: 10 }} accessibilityLabel="Edit playlist" accessibilityRole="button">
                      <Text fontSize={13} fontWeight="500" color={TEXT_PRIMARY}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={deletePlaylist} style={{ borderRadius: 9999, backgroundColor: '#242424', paddingHorizontal: 12, paddingVertical: 10 }} accessibilityLabel="Delete playlist" accessibilityRole="button">
                      <Trash2 size={14} color="#ef4444" />
                    </Pressable>
                  </>
                )}
                  <Pressable
                    onPress={() => { if (songs.length === 0) return; playSong(songs[0], songs, 0); }}
                    style={{ borderRadius: 9999, backgroundColor: 'white', paddingHorizontal: 24, paddingVertical: 10 }}
                    accessibilityLabel="Play playlist"
                    accessibilityRole="button"
                  >
                    <Text fontSize={13} fontWeight="700" color="black">Play</Text>
                  </Pressable>
              </>
            )}
          </View>
        </GlassCard>

        {editing && (
          <Pressable
            onPress={() => setShowAddSongModal(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 16, backgroundColor: '#242424', borderRadius: 12, padding: 14 }}
            accessibilityLabel="Add songs to playlist"
            accessibilityRole="button"
          >
            <Plus size={18} color={ACCENT} />
            <Text fontSize={14} fontWeight="500" color={ACCENT}>Add songs</Text>
          </Pressable>
        )}

        <FlatList
          data={playlistSongs}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          scrollEnabled={false}
          renderItem={renderPlaylistSong}
          ListHeaderComponent={
            (editing ? playlistSongIds : []).length === 0 && songs.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Music size={40} color={TEXT_MUTED} strokeWidth={1.5} />
                <Text style={{ marginTop: 12 }} fontSize={14} color={TEXT_MUTED}>No songs in this playlist</Text>
                <Text style={{ marginTop: 4 }} fontSize={13} color={TEXT_MUTED}>Add songs to get started</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Music size={40} color={TEXT_MUTED} strokeWidth={1.5} />
              <Text style={{ marginTop: 12 }} fontSize={14} color={TEXT_MUTED}>No songs in this playlist</Text>
              <Text style={{ marginTop: 4 }} fontSize={13} color={TEXT_MUTED}>Add songs to get started</Text>
            </View>
          }
        />

        <Modal visible={showContextMenu} transparent animationType="fade" onRequestClose={() => setShowContextMenu(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowContextMenu(false)}>
            <GlassCard padding={8} style={{ width: 220 }} radius={16}>
              {contextSong && (
                <Text fontSize={13} fontWeight="700" color={TEXT_MUTED} numberOfLines={1} style={{ paddingHorizontal: 12, paddingTop: SPACING.sm, paddingBottom: SPACING.sm }}>
                  {contextSong.title}
                </Text>
              )}
              <Pressable onPress={() => handleContextAction('next')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 }} accessibilityLabel="Play next">
                <Play size={16} color={TEXT_PRIMARY} />
                <Text fontSize={14} fontWeight="500" color={TEXT_PRIMARY}>Play Next</Text>
              </Pressable>
              <Pressable onPress={() => handleContextAction('queue')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12 }} accessibilityLabel="Add to queue">
                <ListPlus size={16} color={TEXT_PRIMARY} />
                <Text fontSize={14} fontWeight="500" color={TEXT_PRIMARY}>Add to Queue</Text>
              </Pressable>
            </GlassCard>
          </Pressable>
        </Modal>

        <Modal visible={showAddSongModal} transparent animationType="fade" onRequestClose={() => setShowAddSongModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingTop: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                <Text fontSize={18} fontWeight="700" color={TEXT_PRIMARY}>Add songs</Text>
                <Pressable onPress={() => setShowAddSongModal(false)} accessibilityLabel="Done adding songs" accessibilityRole="button">
                  <Text fontSize={15} color={ACCENT}>Done</Text>
                </Pressable>
              </View>
              <ScrollView style={{ paddingHorizontal: 20 }}>
                {songsNotInPlaylist.length === 0 ? (
                  <Text fontSize={14} color={TEXT_MUTED} style={{ textAlign: 'center', paddingVertical: 40 }}>All songs are in this playlist</Text>
                ) : (
                  songsNotInPlaylist.map((song) => (
                    <Pressable
                      key={song.id}
                      onPress={() => addSong(song.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}
                      accessibilityLabel={`Add ${song.title} by ${song.artist}`}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <Text fontSize={14} fontWeight="700" color={TEXT_PRIMARY} numberOfLines={1}>{song.title}</Text>
                        <Text fontSize={12} color={TEXT_SECONDARY} numberOfLines={1}>{song.artist}</Text>
                      </View>
                      <Plus size={18} color={ACCENT} />
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </View>
  );
}
