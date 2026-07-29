import { Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { View, Text } from 'tamagui';
import { router } from 'expo-router';
import { LogOut, Music, Heart, ListMusic, Play, Clock } from 'lucide-react-native';
import { Artwork } from '@/components/Artwork';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/store/playerStore';
import { api } from '@/services/api';
import type { Song } from '@/services/types';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER, SURFACE, SURFACE_ELEVATED, SURFACE_ICON, DANGER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

interface Stats {
  totalPlays: number;
  totalListeningMs: number;
  likedCount: number;
  playlistCount: number;
}

function StatCard({ icon: Icon, value, label, color }: {
  icon: React.ComponentType<{ size: number; color: string }>;
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: SURFACE,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: BORDER,
      padding: SPACING.sm,
      alignItems: 'center',
      gap: 4,
    }}>
      <View style={{
        width: 32, height: 32, borderRadius: 8,
        backgroundColor: SURFACE_ICON,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} color={color} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: TEXT_PRIMARY, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 9, fontWeight: '600', color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </Text>
    </View>
  );
}

function ProfileSection({ icon: Icon, title, color, count, children }: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  color: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <>
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        marginTop: SPACING.xxl, marginBottom: SPACING.sm, paddingHorizontal: SPACING.xl,
      }}>
        <View style={{
          width: 28, height: 28, borderRadius: 7,
          backgroundColor: SURFACE_ICON,
          alignItems: 'center', justifyContent: 'center',
          marginRight: 10,
        }}>
          <Icon size={14} color={color} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.2, flex: 1 }}>
          {title}
        </Text>
        {count !== undefined && (
          <Text style={{ fontSize: 12, color: TEXT_MUTED }}>{count}</Text>
        )}
      </View>
      <View style={{
        marginHorizontal: SPACING.xl,
        backgroundColor: SURFACE,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: BORDER,
        overflow: 'hidden',
      }}>
        {children}
      </View>
    </>
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
        gap: SPACING.md,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.lg,
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityLabel={`Play ${song.title} by ${song.artist}`}
      accessibilityRole="button"
    >
      <Text style={{
        fontSize: 14, fontWeight: '700',
        color: rank <= 3 ? ACCENT : TEXT_MUTED,
        width: 20, textAlign: 'center',
        fontVariant: ['tabular-nums'],
      }}>
        {rank}
      </Text>
      <Artwork colors={song.colors} style={{ width: 40, height: 40, borderRadius: 8 }} radius={8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY }} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={{ fontSize: 12, color: TEXT_SECONDARY }} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
    </Pressable>
  );
}

function SongRow({ song }: { song: Song }) {
  const playSong = usePlayerStore((s) => s.playSong);
  const current = usePlayerStore((s) => s.current);
  const isPlaying = current?.id === song.id;

  return (
    <Pressable
      onPress={() => playSong(song)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACING.md,
        paddingVertical: SPACING.sm,
        paddingHorizontal: SPACING.lg,
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityLabel={`Play ${song.title} by ${song.artist}`}
      accessibilityRole="button"
    >
      <Artwork colors={song.colors} style={{ width: 40, height: 40, borderRadius: 8 }} radius={8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY }} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={{ fontSize: 12, color: TEXT_SECONDARY }} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
    </Pressable>
  );
}

function toColors(raw: string[]): [string, string] {
  return [raw?.[0] ?? '#6d28d9', raw?.[1] ?? '#db2777'];
}

interface AnalyticsSong {
  id: string; title: string; artist: string; album: string;
  duration_ms: number; colors: string[];
  artist_id?: string; album_id?: string; image_url?: string;
}

interface AnalyticsItem {
  song: AnalyticsSong;
  play_count: number;
  total_listening_ms: number;
  sessions: number;
}

function mapAnalyticsSong(s: AnalyticsSong): Song {
  return {
    id: s.id, title: s.title, artist: s.artist,
    artistId: s.artist_id, album: s.album, albumId: s.album_id,
    duration: '', durationMs: s.duration_ms,
    colors: toColors(s.colors), imageUrl: s.image_url,
  };
}

function formatListeningTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);
  const [stats, setStats] = useState<Stats | null>(null);
  const [topSongs, setTopSongs] = useState<Song[]>([]);
  const [recentSongs, setRecentSongs] = useState<Song[]>([]);
  const [likedList, setLikedList] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const token = useAuthStore.getState().token;
      if (!token) { setLoading(false); return; }
      try {
        const [topRes, likesRes, playlistsRes] = await Promise.all([
          api.topSongs('all', 50, token).catch(() => null),
          api.getLikes(token).catch(() => null),
          api.playlists(token).catch(() => null),
        ]);
        if (cancelled) return;

        const topItems = (topRes?.items ?? []) as AnalyticsItem[];
        const topSongsMapped = topItems.map((item) => mapAnalyticsSong(item.song));
        const songMap = new Map(topSongsMapped.map((s) => [s.id, s]));

        const recIds = recentlyPlayed;
        const recentSongsMapped = recIds.map((id: string) => songMap.get(id)).filter(Boolean) as Song[];
        const likedSongIds = likesRes?.songIds ?? [];
        const likedSongsMapped = likedSongIds.map((id: string) => songMap.get(id)).filter(Boolean) as Song[];

        const totalPlays = topItems.reduce((sum, item) => sum + Number(item.play_count ?? 0), 0);
        const totalListeningMs = topItems.reduce((sum, item) => sum + Number(item.total_listening_ms ?? 0), 0);

        setStats({
          totalPlays, totalListeningMs,
          likedCount: likedSongIds.length,
          playlistCount: (playlistsRes ?? []).length,
        });
        setTopSongs(topSongsMapped);
        setRecentSongs(recentSongsMapped);
        setLikedList(likedSongsMapped);
      } catch {}
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = useCallback(() => {
    logout();
    router.replace('/login');
  }, [logout]);

  const initials = (user?.displayName ?? user?.email ?? 'U').slice(0, 1).toUpperCase();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: SPACING.xxxl }}>
        <View style={{
          paddingTop: 80, paddingBottom: SPACING.xxl,
          paddingHorizontal: SPACING.xl,
          borderBottomWidth: 1, borderBottomColor: BORDER,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.lg }}>
            <View style={{
              width: 64, height: 64, borderRadius: 18,
              backgroundColor: SURFACE_ELEVATED,
              borderWidth: 2, borderColor: ACCENT,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: ACCENT }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 }}>
                {user?.displayName || 'Music Lover'}
              </Text>
              <Text style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 1 }}>
                {user?.email}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginHorizontal: SPACING.xl, gap: SPACING.sm, marginTop: SPACING.lg }}>
          <StatCard icon={Play} value={stats?.totalPlays ?? 0} label="Played" color={ACCENT} />
          <StatCard icon={Clock} value={formatListeningTime(stats?.totalListeningMs ?? 0)} label="Listened" color="#8b5cf6" />
          <StatCard icon={Heart} value={stats?.likedCount ?? 0} label="Liked" color="#ec4899" />
          <StatCard icon={ListMusic} value={stats?.playlistCount ?? 0} label="Playlists" color="#f59e0b" />
        </View>

        {recentSongs.length > 0 && (
          <ProfileSection icon={Clock} title="Recently Played" color={ACCENT}>
            {recentSongs.slice(0, 5).map((song, i) => (
              <TopSongRow key={`${song.id}-${i}`} song={song} index={i} rank={i + 1} />
            ))}
          </ProfileSection>
        )}

        {topSongs.length > 0 && (
          <ProfileSection icon={Music} title="Top Songs" color="#f59e0b">
            {topSongs.slice(0, 8).map((song, i) => (
              <TopSongRow key={song.id} song={song} index={i} rank={i + 1} />
            ))}
          </ProfileSection>
        )}

        {likedList.length > 0 && (
          <ProfileSection icon={Heart} title="Liked Songs" color="#ec4899" count={likedList.length}>
            {likedList.slice(0, 5).map((song, i) => (
              <SongRow key={song.id} song={song} />
            ))}
          </ProfileSection>
        )}

        <View style={{ marginTop: SPACING.xxl, paddingHorizontal: SPACING.xl }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
              backgroundColor: SURFACE_ELEVATED,
              borderRadius: RADIUS.md,
              borderWidth: 1, borderColor: DANGER,
              paddingVertical: SPACING.md,
              opacity: pressed ? 0.7 : 1,
            })}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
          >
            <LogOut size={16} color={DANGER} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: DANGER }}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', marginTop: SPACING.xl }}>
          <Text style={{ fontSize: 11, color: TEXT_MUTED }}>Muzix v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}
