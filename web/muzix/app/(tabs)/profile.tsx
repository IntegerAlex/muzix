import { Pressable, ScrollView } from 'react-native';
import { useEffect, useState, useMemo } from 'react';
import { View, Text } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { LogOut, Music, Heart, ListMusic, Play, Clock, Headphones } from 'lucide-react-native';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { Artwork } from '@/components/Artwork';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/store/playerStore';
import { getSongs, getPlaylists } from '@/services/data';
import type { Song } from '@/services/types';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { SPACING } from '@/lib/sizing';
import { RADIUS } from '@/lib/sizing';

function StatCard({ icon: Icon, value, label, color, subtitle }: {
  icon: React.ComponentType<{ size: number; color: string }>;
  value: string | number;
  label: string;
  color: string;
  subtitle?: string;
}) {
  return (
    <View style={{
      flex: 1,
      backgroundColor: 'rgba(255,255,255,0.03)',
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: `${color}15`,
      padding: SPACING.md,
      alignItems: 'center',
    }}>
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: `${color}12`,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 8,
      }}>
        <Icon size={18} color={color} />
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: TEXT_PRIMARY, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 10, fontWeight: '600', color: TEXT_MUTED, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      {subtitle && (
        <Text style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 1 }}>{subtitle}</Text>
      )}
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
        gap: 12,
        paddingVertical: 10,
        paddingHorizontal: SPACING.lg,
        opacity: pressed ? 0.6 : 1,
      })}
      accessibilityLabel={`Play ${song.title} by ${song.artist}`}
      accessibilityRole="button"
    >
      <Text style={{
        fontSize: 15,
        fontWeight: '700',
        color: rank <= 3 ? ACCENT : TEXT_MUTED,
        width: 22,
        textAlign: 'center',
        fontVariant: ['tabular-nums'],
      }}>
        {rank}
      </Text>
      <Artwork colors={song.colors} style={{ width: 42, height: 42, borderRadius: 8 }} radius={8} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 14, fontWeight: '600', color: TEXT_PRIMARY }}
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
          width: 22, height: 22, borderRadius: 11,
          backgroundColor: ACCENT,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Headphones size={11} color="white" />
        </View>
      )}
    </Pressable>
  );
}

function formatListeningTime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hours}h ${mins}m`;
}

export default function ProfileScreen() {
  const { user, logout } = useAuthStore();
  const likedSongs = usePlayerStore((s) => s.likedSongs);
  const totalPlays = usePlayerStore((s) => s.totalPlays);
  const totalListeningMs = usePlayerStore((s) => s.totalListeningMs);
  const recentlyPlayed = usePlayerStore((s) => s.recentlyPlayed);
  const [songs, setSongs] = useState<Song[]>([]);
  const [totalPlaylists, setTotalPlaylists] = useState(0);

  useEffect(() => {
    setSongs(getSongs());
    setTotalPlaylists(getPlaylists().length);
    const unsub = () => {};
    return unsub;
  }, []);

  const likedList = useMemo(() => {
    return songs.filter((s) => likedSongs[s.id]);
  }, [songs, likedSongs]);

  const recentSongs = useMemo(() => {
    return recentlyPlayed
      .map((id) => songs.find((s) => s.id === id))
      .filter(Boolean) as Song[];
  }, [recentlyPlayed, songs]);

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
        <View style={{ position: 'relative', height: 300 }}>
          <Artwork
            colors={[ACCENT, '#0f172a']}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.3 }}
            radius={0}
          />
          <LinearGradient
            colors={['rgba(11,16,32,0)', 'rgba(11,16,32,0.5)', 'rgba(11,16,32,1)']}
            locations={[0, 0.4, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingHorizontal: SPACING.xxl, paddingBottom: SPACING.xxl,
            flexDirection: 'row', alignItems: 'flex-end', gap: 16,
          }}>
            <View style={{
              width: 80, height: 80, borderRadius: 20,
              backgroundColor: 'rgba(29,185,84,0.12)',
              borderWidth: 2, borderColor: 'rgba(29,185,84,0.3)',
              alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(29,185,84,0.25)',
              elevation: 8,
            }}>
              <Text style={{ fontSize: 34, fontWeight: '700', color: ACCENT }}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 }}>
                {user?.displayName || 'Music Lover'}
              </Text>
              <Text style={{ fontSize: 13, color: TEXT_SECONDARY, marginTop: 2 }} numberOfLines={1}>
                {user?.email}
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_MUTED, marginTop: 3 }}>
                Member since {memberSince}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', marginHorizontal: SPACING.xl, gap: SPACING.sm, marginTop: SPACING.md }}>
          <StatCard icon={Play} value={totalPlays} label="Played" color={ACCENT} />
          <StatCard icon={Clock} value={formatListeningTime(totalListeningMs)} label="Listened" color="#8b5cf6" />
          <StatCard icon={Heart} value={likedList.length} label="Liked" color="#ec4899" />
          <StatCard icon={ListMusic} value={totalPlaylists} label="Playlists" color="#f59e0b" />
        </View>

        {recentSongs.length > 0 && (
          <>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              marginTop: SPACING.xxl, marginBottom: SPACING.sm, paddingHorizontal: SPACING.xl,
            }}>
              <View style={{
                width: 28, height: 28, borderRadius: 7,
                backgroundColor: 'rgba(29,185,84,0.1)',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 10,
              }}>
                <Clock size={14} color={ACCENT} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.2, flex: 1 }}>
                Recently Played
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
              {recentSongs.slice(0, 8).map((song, i) => (
                <TopSongRow key={`${song.id}-${i}`} song={song} index={i} rank={i + 1} />
              ))}
            </View>
          </>
        )}

        {likedList.length > 0 && (
          <>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              marginTop: recentSongs.length > 0 ? SPACING.xl : SPACING.xxl,
              marginBottom: SPACING.sm, paddingHorizontal: SPACING.xl,
            }}>
              <View style={{
                width: 28, height: 28, borderRadius: 7,
                backgroundColor: 'rgba(236,72,153,0.1)',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 10,
              }}>
                <Heart size={14} color="#ec4899" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.2, flex: 1 }}>
                Liked Songs
              </Text>
              <Text style={{ fontSize: 11, color: TEXT_MUTED }}>
                {likedList.length}
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

        <View style={{ marginTop: SPACING.xxl, paddingHorizontal: SPACING.xl }}>
          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: pressed ? 'rgba(244,63,94,0.12)' : 'rgba(244,63,94,0.06)',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(244,63,94,0.15)',
              paddingVertical: 13,
              opacity: pressed ? 0.8 : 1,
            })}
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            hitSlop={8}
          >
            <LogOut size={16} color="#f43f5e" />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#f43f5e' }}>
              Sign Out
            </Text>
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', marginTop: SPACING.xl }}>
          <Text style={{ fontSize: 11, color: TEXT_MUTED }}>Muzix v1.0.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}
