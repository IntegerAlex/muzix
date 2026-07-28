import { Pressable, ScrollView } from 'react-native';
import { useEffect, useState, useMemo } from 'react';
import { View, Text } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { LogOut, Music, Heart, ListMusic } from 'lucide-react-native';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { Artwork } from '@/components/Artwork';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/store/playerStore';
import { api, type ApiSong } from '@/services/api';
import type { Song } from '@/services/types';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

function mapSong(s: ApiSong): Song {
  return {
    id: String(s.id),
    title: s.title,
    artist: s.artist,
    artistId: s.artistId,
    album: s.album,
    albumId: s.albumId,
    duration: s.duration,
    durationMs: s.durationMs,
    track: s.track ?? undefined,
    colors: [s.colors?.[0] ?? '#6d28d9', s.colors?.[1] ?? '#db2777'],
    lyrics: s.lyrics ?? undefined,
    audioUrl: s.audioUrl ?? undefined,
  };
}

function StatCard({ icon: Icon, value, label, color }: {
  icon: React.ComponentType<{ size: number; color: string }>; value: string | number; label: string; color: string;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: `${color}10`,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: `${color}20`,
      padding: SPACING.lg,
      alignItems: 'center',
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: `${color}18`,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 10,
      }}>
        <Icon size={18} color={color} />
      </View>
      <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT_PRIMARY, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, fontWeight: '500', color: TEXT_MUTED, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
    </View>
  );
}

function TopSongRow({ song, index, rank }: { song: Song; index: number; rank: number }) {
  const playSong = usePlayerStore((s) => s.playSong);
  const current = usePlayerStore((s) => s.current);
  const isPlaying = current?.id === song.id;

  return (
    <Pressable
      onPress={() => playSong(song)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 10,
        paddingHorizontal: SPACING.lg,
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityLabel={`Play ${song.title} by ${song.artist}`}
      accessibilityRole="button"
    >
      <Text style={{
        fontSize: 16,
        fontWeight: '700',
        color: rank <= 3 ? ACCENT : TEXT_MUTED,
        width: 24,
        textAlign: 'center',
        fontVariant: ['tabular-nums'],
      }}>
        {rank}
      </Text>
      <Artwork colors={song.colors} style={{ width: 44, height: 44, borderRadius: 8 }} radius={8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: TEXT_PRIMARY }}
          numberOfLines={1}
        >
          {song.title}
        </Text>
        <Text style={{ fontSize: 12, color: TEXT_SECONDARY }} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      {isPlaying && (
        <View style={{
          width: 24, height: 24, borderRadius: 12,
          backgroundColor: ACCENT,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Music size={12} color="white" />
        </View>
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const likedSongs = usePlayerStore((s) => s.likedSongs);
  const [songs, setSongs] = useState<Song[]>([]);
  const [totalPlaylists, setTotalPlaylists] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const [apiSongs, playlists] = await Promise.all([
          api.songs(500),
          api.playlists(),
        ]);
        setSongs(apiSongs.map(mapSong));
        setTotalPlaylists(playlists.length);
      } catch {}
    }
    load();
  }, []);

  const likedList = useMemo(() => {
    return songs.filter((s) => likedSongs[s.id]);
  }, [songs, likedSongs]);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const initials = (user?.displayName ?? user?.email ?? 'U').slice(0, 1).toUpperCase();
  const memberSince = '2026';

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <AnimatedBackdrop />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Full-bleed hero */}
        <View style={{ position: 'relative', height: 320 }}>
          <Artwork
            colors={[ACCENT, BG]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }}
            radius={0}
          />
          <LinearGradient
            colors={['rgba(11,16,32,0)', 'rgba(11,16,32,0.6)', 'rgba(11,16,32,1)']}
            locations={[0, 0.5, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.xxxl,
            flexDirection: 'row', alignItems: 'flex-end', gap: 18,
          }}>
            {/* Avatar */}
            <View style={{
              width: 84, height: 84, borderRadius: 22,
              backgroundColor: 'rgba(29,185,84,0.15)',
              borderWidth: 2, borderColor: 'rgba(29,185,84,0.4)',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(29,185,84,0.3)',
              elevation: 8,
            }}>
              <Text style={{ fontSize: 36, fontWeight: '700', color: ACCENT }}>{initials}</Text>
            </View>
            {/* Name + email */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.4 }}>
                {user?.displayName || 'Music Lover'}
              </Text>
              <Text style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 3 }}>
                {user?.email}
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 4 }}>
                Member since {memberSince}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: 'row', marginHorizontal: SPACING.xl, gap: SPACING.sm, marginTop: SPACING.sm }}>
          <StatCard icon={Music} value={songs.length} label="Songs" color={ACCENT} />
          <StatCard icon={ListMusic} value={totalPlaylists} label="Playlists" color="#8b5cf6" />
          <StatCard icon={Heart} value={likedList.length} label="Liked" color="#ec4899" />
        </View>

        {/* Top Liked Songs */}
        {likedList.length > 0 && (
          <>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              marginTop: SPACING.xxxl, marginBottom: SPACING.sm, paddingHorizontal: SPACING.xl,
            }}>
              <View style={{
                width: 32, height: 32, borderRadius: 8,
                backgroundColor: 'rgba(236,72,153,0.12)',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 12,
              }}>
                <Heart size={16} color="#ec4899" />
              </View>
              <Text style={{ fontSize: 19, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3, flex: 1 }}>
                Your Top Songs
              </Text>
              <Text style={{ fontSize: 12, color: TEXT_MUTED }}>
                {likedList.length} total
              </Text>
            </View>
            <View style={{
              marginHorizontal: SPACING.xl,
              backgroundColor: 'rgba(255,255,255,0.02)',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: BORDER,
              overflow: 'hidden',
            }}>
              {likedList.slice(0, 5).map((song, i) => (
                <TopSongRow key={song.id} song={song} index={i} rank={i + 1} />
              ))}
            </View>
          </>
        )}

        {/* Account */}
        <View style={{ marginTop: SPACING.xxxl, paddingHorizontal: SPACING.xl }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              backgroundColor: pressed ? 'rgba(244,63,94,0.15)' : 'rgba(244,63,94,0.08)',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: 'rgba(244,63,94,0.2)',
              paddingVertical: 14,
              opacity: pressed ? 0.8 : 1,
            })}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            hitSlop={8}
          >
            <LogOut size={18} color="#f43f5e" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#f43f5e' }}>
              Sign Out
            </Text>
          </Pressable>
        </View>

        {/* Footer */}
        <View style={{ alignItems: 'center', marginTop: SPACING.xxl }}>
          <Text style={{ fontSize: 11, color: TEXT_MUTED }}>Muzix v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}
