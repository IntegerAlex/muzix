import { useEffect, useState, useCallback, Platform } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, ScrollView, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, Music, Album, User, ListMusic } from '@/lib/icons';
import { BG, SURFACE, SURFACE_ELEVATED, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER, DANGER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000";
const WEB_URL = "https://muzix.gossorg.in";

interface ShareData {
  share_token: string;
  content_type: string;
  content_id: string;
  title: string;
  artist: string;
  image_url: string;
  lyrics: string[] | null;
  selected_lyrics_lines: number[] | null;
  expires_at: string;
}

export default function ShareScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShare = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/share/${token}`, { method: 'GET' });
      const json = await res.json();
      if (json.status === 'success' && json.data && json.data.share_token) {
        setData(json.data);
      } else {
        setError('This share link is invalid or has expired');
      }
    } catch {
      setError("Can't load share preview. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchShare(); }, [fetchShare]);

  const handleOpenInApp = useCallback(async () => {
    if (!data) return;
    const url = `muzix://album/${data.content_id}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      const storeUrl = Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/muzix/id0000000000'
        : 'https://play.google.com/store/apps/details?id=com.muzix.app';
      await Linking.openURL(storeUrl);
    }
  }, [data]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.loadingText}>Loading share...</Text>
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.container}>
        <AlertTriangle size={48} color={DANGER} />
        <Text style={styles.errorHeading}>Oops!</Text>
        <Text style={styles.errorText}>{error || 'This share link is invalid or has expired'}</Text>
        <Pressable style={styles.retryButton} onPress={fetchShare}>
          <Text style={styles.retryButtonText}>Try again</Text>
        </Pressable>
        <Pressable style={styles.homeButton} onPress={() => router.push('/')}>
          <Text style={styles.homeButtonText}>Go to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.card}>
        {data.image_url ? (
          <Image source={{ uri: data.image_url }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            {data.content_type === 'song' && <Music size={48} color={TEXT_MUTED} />}
            {data.content_type === 'album' && <Album size={48} color={TEXT_MUTED} />}
            {data.content_type === 'artist' && <User size={48} color={TEXT_MUTED} />}
            {data.content_type === 'playlist' && <ListMusic size={48} color={TEXT_MUTED} />}
          </View>
        )}

        <Text style={styles.title}>{data.title}</Text>
        {data.artist ? <Text style={styles.artist}>{data.artist}</Text> : null}

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{data.content_type}</Text>
        </View>

        {data.lyrics && data.lyrics.length > 0 && (
          <View style={styles.lyricsBox}>
            <Text style={styles.lyricsBoxTitle}>Lyrics</Text>
            {data.lyrics.map((line, i) => (
              <Text key={i} style={styles.lyricsLine}>{line}</Text>
            ))}
          </View>
        )}

        <Pressable style={styles.openButton} onPress={handleOpenInApp}>
          <Text style={styles.openButtonText}>Open in MUZIX</Text>
        </Pressable>

        <Pressable style={styles.webButton} onPress={() => Linking.openURL(`${WEB_URL}/album/${data.content_id}`)}>
          <Text style={styles.webButtonText}>Or continue in browser</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  contentContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  card: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    padding: SPACING.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: BORDER,
  },
  artwork: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  artworkFallback: {
    backgroundColor: SURFACE_ELEVATED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    marginBottom: 4,
  },
  artist: {
    fontSize: 16,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  badge: {
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: SPACING.lg,
  },
  badgeText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  lyricsBox: {
    width: '100%',
    backgroundColor: SURFACE_ELEVATED,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  lyricsBoxTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  lyricsLine: {
    fontSize: 14,
    color: TEXT_PRIMARY,
    lineHeight: 22,
  },
  openButton: {
    backgroundColor: ACCENT,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  openButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  webButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  webButtonText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  loadingText: {
    color: TEXT_SECONDARY,
    marginTop: SPACING.md,
    fontSize: 14,
  },
  errorHeading: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginTop: SPACING.lg,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xl,
  },
  retryButton: {
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: SPACING.md,
  },
  retryButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
  homeButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  homeButtonText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
  },
});
