import { Pressable, ScrollView, View, RefreshControl, Modal, TextInput } from 'react-native';
import { Link } from 'expo-router';
import { useState, useCallback, memo } from 'react';
import { Text } from 'tamagui';
import { Music, Plus } from 'lucide-react-native';
import { Artwork } from '@/components/Artwork';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { useAlbums, useArtists, usePlaylists, reloadAll } from '@/services/data';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { RADIUS } from '@/lib/sizing';
import { SPACING } from '@/lib/spacing';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, SURFACE_ELEVATED, SURFACE_ICON, BORDER } from '@/lib/colors';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/authStore';

const PALETTE: [string, string][] = [
  ['#7c3aed', '#2563eb'],
  ['#ec4899', '#06b6d4'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#3b82f6'],
  ['#f43f5e', '#8b5cf6'],
  ['#06b6d4', '#3b82f6'],
  ['#fb923c', '#db2777'],
  ['#84cc16', '#06b6d4'],
];

function pickColors(index: number, fallback: [string, string]): [string, string] {
  return fallback[0] === '#6d28d9' ? PALETTE[index % PALETTE.length] : fallback;
}

const GridItem = memo(function GridItem({ children, index }: { children: React.ReactNode; index: number }) {
  return (
    <View style={{ width: '48%' }}>
      <AnimatedEntrance index={index}>
        {children}
      </AnimatedEntrance>
    </View>
  );
});

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: SPACING.xxxl, paddingHorizontal: SPACING.xl }}>
      <Text style={{ fontSize: 15, color: TEXT_MUTED, textAlign: 'center', marginBottom: SPACING.lg }}>{message}</Text>
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

export default function LibraryScreen() {
  const { data: albums, loading: albumsLoading, error: albumsError, refetch: reloadAlbums } = useAlbums();
  const { data: artists, loading: artistsLoading, error: artistsError, refetch: reloadArtists } = useArtists();
  const { data: playlists, loading: playlistsLoading, error: playlistsError, refetch: reloadPlaylists } = usePlaylists();

  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [creating, setCreating] = useState(false);
  const token = useAuthStore((s) => s.token);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reloadAll();
    Promise.all([reloadAlbums(), reloadArtists(), reloadPlaylists()]).finally(() => setRefreshing(false));
  }, [reloadAlbums, reloadArtists, reloadPlaylists]);

  const handleCreatePlaylist = useCallback(async () => {
    if (!newPlaylistName.trim() || !token) return;
    setCreating(true);
    try {
      await api.createPlaylist(newPlaylistName.trim(), [], token);
      setNewPlaylistName('');
      setShowCreateModal(false);
      reloadPlaylists();
    } catch {}
    setCreating(false);
  }, [newPlaylistName, token, reloadPlaylists]);

  const loading = albumsLoading || artistsLoading || playlistsLoading;
  const error = albumsError || artistsError || playlistsError;
  const isEmpty = !loading && playlists.length === 0 && albums.length === 0 && artists.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100, paddingTop: 64 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.xl }}>
          <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.6, color: TEXT_PRIMARY }}>
            Library
          </Text>
          {token && (
            <Pressable
              onPress={() => setShowCreateModal(true)}
              style={{ width: 40, height: 40, borderRadius: RADIUS.xl, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel="Create playlist"
              hitSlop={4}
            >
              <Plus size={22} color="white" strokeWidth={2.5} />
            </Pressable>
          )}
        </View>

        <Modal visible={showCreateModal} transparent animationType="fade" onRequestClose={() => setShowCreateModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
            <View style={{ backgroundColor: SURFACE_ELEVATED, borderRadius: RADIUS.lg, padding: SPACING.xxl, width: '100%' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY, marginBottom: 16 }}>New Playlist</Text>
              <TextInput
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                placeholder="Playlist name"
                placeholderTextColor={TEXT_MUTED}
                autoFocus
                style={{ backgroundColor: SURFACE_ICON, borderRadius: RADIUS.sm, padding: SPACING.md, fontSize: 16, color: TEXT_PRIMARY, marginBottom: 20 }}
                onSubmitEditing={handleCreatePlaylist}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.md }}>
                <Pressable onPress={() => { setShowCreateModal(false); setNewPlaylistName(''); }} style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm }} accessibilityLabel="Cancel" accessibilityRole="button">
                  <Text style={{ fontSize: 15, color: TEXT_MUTED }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleCreatePlaylist}
                  disabled={!newPlaylistName.trim() || creating}
                  style={{ backgroundColor: ACCENT, borderRadius: RADIUS.md, paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm, opacity: newPlaylistName.trim() ? 1 : 0.5 }}
                  accessibilityLabel="Create playlist"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !newPlaylistName.trim() || creating }}
                >
                  <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>{creating ? 'Creating…' : 'Create'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        {!loading && (
          <Text style={{ marginTop: SPACING.md, fontSize: 13, fontWeight: '500', color: TEXT_MUTED, paddingHorizontal: SPACING.xl }}>
            {playlists.length} playlists · {albums.length} albums · {artists.length} artists
          </Text>
        )}

        {error ? (
          <ErrorView message={error} onRetry={onRefresh} />
        ) : isEmpty ? (
          <View style={{ alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 }}>
            <Music size={56} color={TEXT_MUTED} strokeWidth={1.5} />
            <Text style={{ marginTop: SPACING.xxl, textAlign: 'center', fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY }}>
              Your library is empty
            </Text>
            <Text style={{ marginTop: SPACING.sm, textAlign: 'center', fontSize: 14, color: TEXT_MUTED }}>
              Albums, artists, and playlists you save will appear here.
            </Text>
          </View>
        ) : (
          <>
            {/* Playlists */}
            <SectionHeader title="Playlists" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl, gap: SPACING.md }}>
              {playlistsLoading ? (
                [1, 2, 3, 4].map((i) => <Skeleton key={i} width="48%" height={200} borderRadius={RADIUS.lg} />)
              ) : (
                playlists.map((p, i) => (
                  <GridItem key={p.id} index={i}>
                    <Link href={`/playlist/${p.id}`} asChild>
                      <Pressable accessibilityLabel={p.title} accessibilityRole="button">
                        <Artwork colors={pickColors(i, p.colors)} style={{ height: 160, width: '100%' }} radius={RADIUS.lg} />
                        <Text style={{ marginTop: SPACING.md, fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY }} numberOfLines={1}>
                          {p.title}
                        </Text>
                        <Text style={{ marginTop: SPACING.xs, fontSize: 12, fontWeight: '500', color: TEXT_SECONDARY }}>
                          {p.songIds.length} songs
                        </Text>
                      </Pressable>
                    </Link>
                  </GridItem>
                ))
              )}
            </View>

            {/* Artists */}
            <SectionHeader title="Artists" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl, gap: SPACING.md }}>
              {artistsLoading ? (
                [1, 2, 3, 4].map((i) => <Skeleton key={i} width="48%" height={200} borderRadius={80} />)
              ) : (
                artists.map((a, i) => (
                  <GridItem key={a.id} index={i}>
                    <Link href={`/artist/${a.id}`} asChild>
                      <Pressable accessibilityLabel={a.name} accessibilityRole="button">
                         <Artwork colors={pickColors(i + 3, a.colors)} style={{ height: 160, width: '100%' }} radius={80} />
                         <Text style={{ marginTop: SPACING.md, fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY }} numberOfLines={1}>
                          {a.name}
                        </Text>
                      </Pressable>
                    </Link>
                  </GridItem>
                ))
              )}
            </View>

            {/* Albums */}
            <SectionHeader title="Albums" />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: SPACING.xl, gap: SPACING.md }}>
              {albumsLoading ? (
                [1, 2, 3, 4].map((i) => <Skeleton key={i} width="48%" height={200} borderRadius={RADIUS.lg} />)
              ) : (
                albums.map((al, i) => (
                  <GridItem key={al.id} index={i}>
                    <Link href={`/album/${al.id}`} asChild>
                      <Pressable accessibilityLabel={`${al.title} by ${al.artist}`} accessibilityRole="button">
                        <Artwork colors={pickColors(i + 5, al.colors)} style={{ height: 160, width: '100%' }} radius={RADIUS.lg} />
                         <Text style={{ marginTop: SPACING.md, fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY }} numberOfLines={1}>
                          {al.title}
                        </Text>
                        <Text style={{ marginTop: SPACING.xs, fontSize: 12, fontWeight: '500', color: TEXT_SECONDARY }} numberOfLines={1}>
                          {al.artist}
                        </Text>
                      </Pressable>
                    </Link>
                  </GridItem>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
