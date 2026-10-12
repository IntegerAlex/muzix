import { useState, useCallback, useEffect } from 'react';
import { Link, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, TextInput } from 'react-native';
import { View, Text } from 'tamagui';
import { Search, ChevronLeft, ChevronRight, ListMusic, Music, User } from '@/lib/icons';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { SongSkeleton } from '@/components/Skeleton';
import { useSearch } from '@/services/data';
import { usePlayerStore } from '@/store/playerStore';
import { useSharing } from '@/hooks/useSharing';
import { useToast } from '@/components/Toast';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { Artwork } from '@/components/Artwork';
import { RADIUS } from '@/lib/sizing';
import { BG, SURFACE, SURFACE_ICON, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { useResponsive } from '@/lib/useResponsive';
import { SPACING } from '@/lib/spacing';
import { formatTime } from '@/lib/utils';
import { resolveAudio, searchYouTube, canExtractOnDevice, type YouTubeSearchHit } from '@/services/audioSource';
import type { Song } from '@/services/types';

const RECENT_KEY = 'muzix_recent_searches';
const MAX_RECENT = 8;

function loadRecent(): string[] {
  try {
    if (typeof localStorage !== 'undefined') {
      return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    }
  } catch {}
  return [];
}

function persistRecent(terms: string[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(RECENT_KEY, JSON.stringify(terms));
    }
  } catch {}
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function SearchInput({ query, setQuery }: { query: string; setQuery: (q: string) => void }) {
  return (
    <TextInput
      value={query}
      onChangeText={setQuery}
      placeholder="Songs, artists, albums…"
      placeholderTextColor={TEXT_MUTED}
      autoCorrect={false}
      spellCheck={false}
      textContentType="none"
      style={{
        marginTop: SPACING.lg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: CARD_BG,
        paddingHorizontal: 16,
        paddingVertical: SPACING.md,
        fontSize: 15,
        color: TEXT_PRIMARY,
      }}
      accessibilityLabel="Search"
      accessibilityHint="Search for songs, artists, and albums"
    />
  );
}

function LoadingState() {
  return (
    <View style={{ paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 12 }}>
        <ActivityIndicator size="small" color={ACCENT} />
        <Text fontSize={13} color={TEXT_MUTED}>Searching…</Text>
      </View>
      {[1, 2, 3, 4, 5].map((i) => <SongSkeleton key={i} />)}
    </View>
  );
}

function EmptyQueryState() {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60 }}>
      <Search size={48} color={TEXT_MUTED} strokeWidth={1.5} />
      <Text style={{ marginTop: 16, textAlign: 'center' }} fontSize={15} color={TEXT_MUTED}>
        What do you want to listen to?
      </Text>
    </View>
  );
}

function NoResultsState({ query }: { query: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60 }}>
      <Search size={48} color={TEXT_MUTED} strokeWidth={1.5} />
      <Text style={{ marginTop: SPACING.md, textAlign: 'center', fontWeight: '500' }} fontSize={15} color={TEXT_SECONDARY}>
        No results for &quot;{query.trim()}&quot;
      </Text>
      <Text style={{ marginTop: SPACING.sm, textAlign: 'center' }} fontSize={13} color={TEXT_MUTED}>
        Try different keywords or check the spelling
      </Text>
    </View>
  );
}

function RecentSearches({ terms, onSelect, onClear }: { terms: string[]; onSelect: (t: string) => void; onClear: () => void }) {
  if (terms.length === 0) return null;
  return (
    <View style={{ marginTop: SPACING.xxl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md, marginTop: SPACING.xxxl }}>
        <Text fontSize={20} fontWeight="700" color={TEXT_PRIMARY}>Recent</Text>
        <Pressable onPress={onClear} accessibilityLabel="Clear recent searches" accessibilityRole="button">
          <Text fontSize={14} fontWeight="500" color={TEXT_SECONDARY}>Clear</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
        {terms.map((term) => (
          <Pressable
            key={term}
            onPress={() => onSelect(term)}
            style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 16, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER }}
            accessibilityLabel={`Search ${term}`}
            accessibilityRole="button"
          >
            <Text fontSize={13} fontWeight="500" color={TEXT_PRIMARY}>{term}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SearchResults({ results, current, onShare, isSharing, showSongs, showAlbums, showArtists }: {
  results: { songs: Song[]; albums: { id: string; title: string; artist: string; colors: string[] }[]; artists: { id: string; name: string; colors: string[] }[] };
  current: Song | null;
  onShare: (song: Song) => void;
  isSharing: boolean;
  showSongs: boolean;
  showAlbums: boolean;
  showArtists: boolean;
}) {
  return (
    <>
      {showSongs && results.songs.map((songItem, i) => (
        <AnimatedEntrance key={songItem.id} index={i}>
          <SongRow
            song={songItem}
            index={i}
            queue={results.songs}
            isCurrent={current?.id === songItem.id}
            onShare={onShare}
            source="search"
            isSharing={isSharing}
          />
        </AnimatedEntrance>
      ))}

      {showAlbums && results.albums.length > 0 && <SectionHeader title="Albums" />}
      {showAlbums && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md }}>
          {results.albums.map((album, i) => (
            <AnimatedEntrance key={album.id} index={i}>
              <View style={{ width: '47%' }}>
                <Link href={`/album/${album.id}` as Href} asChild>
                  <Pressable accessibilityLabel={`${album.title} by ${album.artist}`} accessibilityRole="button">
                    <Artwork colors={album.colors} style={{ height: 160, width: '100%' }} radius={RADIUS.lg} />
                    <Text style={{ marginTop: SPACING.sm }} fontSize={13} fontWeight="700" color={TEXT_PRIMARY} numberOfLines={1}>
                      {album.title}
                    </Text>
                    <Text style={{ marginTop: SPACING.xs }} fontSize={11} fontWeight="500" color={TEXT_SECONDARY} numberOfLines={1}>
                      {album.artist}
                    </Text>
                  </Pressable>
                </Link>
              </View>
            </AnimatedEntrance>
          ))}
        </View>
      )}

      {showArtists && results.artists.length > 0 && <SectionHeader title="Artists" />}
      {showArtists && results.artists.map((artist, i) => (
        <AnimatedEntrance key={artist.id} index={i}>
          <Link href={`/artist/${artist.id}` as Href} asChild>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.sm }}
              accessibilityLabel={artist.name}
              accessibilityRole="button"
            >
              <Artwork colors={artist.colors} style={{ height: 48, width: 48 }} radius={9999} />
              <Text fontSize={15} fontWeight="500" color={TEXT_PRIMARY}>{artist.name}</Text>
            </Pressable>
          </Link>
        </AnimatedEntrance>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// YouTube (not in your library yet)
// ---------------------------------------------------------------------------

function YouTubeResults({
  hits,
  loading,
  query: _query,
  standalone = false,
}: {
  hits: YouTubeSearchHit[];
  loading: boolean;
  query: string;
  standalone?: boolean;
}) {
  const { playSong, setLoading } = usePlayerStore.getState();
  const [loadingId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const play = useCallback(async (hit: YouTubeSearchHit) => {
    setBusyId(hit.id);
    setProgress((p) => ({ ...p, [hit.id]: 0 }));
    try {
      setLoading(hit.id);
      // Resolve first so the user sees a real error if extraction fails,
      // rather than a spinner that never resolves. Progress streams in
      // while the bytes download.
      await resolveAudio(hit.id, null, (f) => {
        setProgress((p) => ({ ...p, [hit.id]: f }));
      });
      // The tapped results become the queue (same convention as every list
      // screen): otherwise "next" would walk whatever stale queue was loaded
      // before, instead of continuing through these results / autoplay.
      const toSong = (h: YouTubeSearchHit): Song => ({
        id: h.id,
        title: h.title,
        artist: 'YouTube',
        artistId: 'youtube',
        album: 'YouTube',
        albumId: 'youtube',
        genre: '',
        duration: h.durationSec ? formatTime(h.durationSec * 1000) : '',
        durationMs: h.durationSec * 1000,
        colors: ['#6d28d9', '#db2777'],
        imageUrl: `https://i.ytimg.com/vi/${h.id}/mqdefault.jpg`,
      });
      const songs = hits.map(toSong);
      const index = Math.max(0, songs.findIndex((s) => s.id === hit.id));
      playSong(songs[index], songs, index, 'search');
    } catch (e: any) {
      usePlayerStore.setState({
        error: e?.message?.slice?.(0, 160) || 'Could not get that track from YouTube',
      });
    } finally {
      setBusyId(null);
      setLoading(null);
      setProgress((p) => {
        if (!(hit.id in p)) return p;
        const next = { ...p };
        delete next[hit.id];
        return next;
      });
    }
  }, [playSong, setLoading, hits]);

  return (
    <View style={{ marginTop: SPACING.xxl }}>
      {!standalone && <View style={{ height: 1, backgroundColor: BORDER, marginBottom: SPACING.lg }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md }}>
        <Music size={14} color={ACCENT} />
        <Text fontSize={12} fontWeight="600" color={TEXT_MUTED} style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Search all of YouTube
        </Text>
        {loading && <ActivityIndicator size="small" color={ACCENT} />}
      </View>

      {hits.length === 0 && !loading && (
        <Text fontSize={13} color={TEXT_MUTED}>No YouTube matches.</Text>
      )}

      {hits.map((hit) => {
        const busy = loadingId === hit.id;
        const pct = progress[hit.id];
        return (
          <Pressable
            key={hit.id}
            onPress={() => void play(hit)}
            disabled={busy}
            hitSlop={8}
            accessibilityLabel={`Play ${hit.title} from YouTube`}
            accessibilityRole="button"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING.md,
              paddingVertical: SPACING.sm,
              opacity: busy ? 0.6 : 1,
            }}
          >
            <View style={{
              width: 40, height: 40, borderRadius: RADIUS.sm,
              backgroundColor: SURFACE_ICON, alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {busy
                ? <ActivityIndicator size="small" color={TEXT_PRIMARY} />
                : <Music size={16} color={TEXT_SECONDARY} />}
              {busy && pct != null && pct > 0 && (
                <View style={{
                  position: 'absolute', left: 0, right: 0, bottom: 0, height: 3,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                }}>
                  <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', backgroundColor: ACCENT }} />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text fontSize={14} color={TEXT_PRIMARY} numberOfLines={1}>{hit.title}</Text>
              <Text fontSize={12} color={TEXT_MUTED}>
                {busy && pct != null && pct > 0
                  ? `Downloading… ${Math.round(pct * 100)}%`
                  : hit.durationSec ? formatTime(hit.durationSec * 1000) : 'YouTube'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SearchScreen() {
  const responsive = useResponsive();
  const isWide = (responsive.isTablet || responsive.isDesktop) && responsive.orientation === 'landscape';
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<'all' | 'songs' | 'albums' | 'artists'>('all');

  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecent);
  const current = usePlayerStore((s) => s.current);
  const { share, isSharing, shareError, resetError } = useSharing();
  const { toast } = useToast();

  useEffect(() => {
    if (shareError) {
      toast(shareError, 'error');
      resetError();
    }
  }, [shareError]);

  const handleShare = useCallback(async (song: Song) => {
    try {
      await share({ contentType: 'song', contentId: song.id, title: song.title, artist: song.artist, imageUrl: song.imageUrl });
      toast('Link copied!', 'success');
    } catch {}
  }, [share, toast]);

  const { data: results, loading } = useSearch(query);
  const hasQuery = query.trim().length > 0;
  const hasResults = results.songs.length > 0 || results.albums.length > 0 || results.artists.length > 0;

  // On-device YouTube search — lets you find any song, not just what's already
  // in the catalog. Empty array on web/iOS/Expo Go, which just hides the section.
  const [youtubeHits, setYoutubeHits] = useState<YouTubeSearchHit[]>([]);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [canExtract, setCanExtract] = useState(false);

  useEffect(() => {
    void canExtractOnDevice().then(setCanExtract);
  }, []);

  useEffect(() => {
    if (!hasQuery || !canExtract) {
      setYoutubeHits([]);
      return;
    }
    let cancelled = false;
    setYoutubeLoading(true);
    const timer = setTimeout(() => {
      searchYouTube(query, 8)
        .then((hits) => { if (!cancelled) { setYoutubeHits(hits); setYoutubeLoading(false); } })
        .catch(() => { if (!cancelled) setYoutubeLoading(false); });
    }, 400); // longer than the local debounce; network is slower
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, hasQuery, canExtract]);

  useEffect(() => {
    if (!loading && hasQuery && hasResults) {
      const q = query.trim();
      const updated = [q, ...recentSearches.filter((r) => r !== q)].slice(0, MAX_RECENT);
      setRecentSearches(updated);
      persistRecent(updated);
    }
  }, [loading, hasQuery, hasResults]);

  const handleRecentPress = useCallback((term: string) => {
    setQuery(term);
  }, []);

  const clearRecent = useCallback(() => {
    setRecentSearches([]);
    persistRecent([]);
  }, []);

  const showSongs = filter === 'all' || filter === 'songs';
  const showAlbums = filter === 'all' || filter === 'albums';
  const showArtists = filter === 'all' || filter === 'artists';

  if (isWide) {
    const filterItems = [
      { key: 'all' as const, icon: Search, label: 'All' },
      { key: 'songs' as const, icon: Music, label: 'Songs' },
      { key: 'albums' as const, icon: ListMusic, label: 'Albums' },
      { key: 'artists' as const, icon: User, label: 'Artists' },
    ];

    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: BG }}>
        <View style={{
          width: collapsed ? 72 : 320,
          backgroundColor: SURFACE,
          borderRightWidth: 1,
          borderRightColor: BORDER,
          paddingTop: 64,
        }}>
          <Pressable
            onPress={() => setCollapsed(!collapsed)}
            style={{ alignSelf: 'flex-end', padding: SPACING.sm, marginRight: SPACING.sm, marginBottom: SPACING.lg }}
            hitSlop={8}
            accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            accessibilityRole="button"
          >
            {collapsed ? <ChevronRight size={18} color={TEXT_SECONDARY} /> : <ChevronLeft size={18} color={TEXT_SECONDARY} />}
          </Pressable>

          {filterItems.map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setFilter(item.key)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: SPACING.sm,
                  paddingHorizontal: collapsed ? 0 : SPACING.xl,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                }}
                accessibilityLabel={item.label}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <item.icon size={20} color={active ? ACCENT : TEXT_SECONDARY} />
                {!collapsed && (
                  <Text fontSize={14} fontWeight={active ? '700' : '500'} color={active ? ACCENT : TEXT_SECONDARY}>
                    {item.label}
                  </Text>
                )}
              </Pressable>
            );
          })}

          {!collapsed && !hasQuery && recentSearches.length > 0 && (
            <View style={{ marginTop: SPACING.xxl, paddingHorizontal: SPACING.xl }}>
              <Text fontSize={12} fontWeight="600" color={TEXT_MUTED} style={{ marginBottom: SPACING.sm, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Recent
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs }}>
                {recentSearches.slice(0, 6).map((term) => (
                  <Pressable
                    key={term}
                    onPress={() => handleRecentPress(term)}
                    style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: CARD_BG }}
                    accessibilityLabel={`Search ${term}`}
                    accessibilityRole="button"
                  >
                    <Text fontSize={12} color={TEXT_PRIMARY}>{term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: 96, paddingTop: 64 }}
          >
            <Text fontSize={28} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY}>Search</Text>
            <SearchInput query={query} setQuery={setQuery} />

            {!hasQuery ? (
              <>
                <EmptyQueryState />
              </>
            ) : loading ? (
              <LoadingState />
            ) : hasResults ? (
              <SearchResults
                results={results}
                current={current}
                onShare={handleShare}
                isSharing={isSharing}
                showSongs={showSongs}
                showAlbums={showAlbums}
                showArtists={showArtists}
              />
            ) : (
              <NoResultsState query={query} />
            )}
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: 96, paddingTop: 64 }}
      >
        <Text fontSize={28} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY}>Search</Text>
        <SearchInput query={query} setQuery={setQuery} />

        {!hasQuery ? (
          <>
            <EmptyQueryState />
            <RecentSearches terms={recentSearches} onSelect={handleRecentPress} onClear={clearRecent} />
          </>
        ) : loading ? (
          <LoadingState />
        ) : hasResults ? (
          <>
            <SearchResults
              results={results}
              current={current}
              onShare={handleShare}
              isSharing={isSharing}
              showSongs={true}
              showAlbums={true}
              showArtists={true}
            />
            {(canExtract && (youtubeLoading || youtubeHits.length > 0)) && (
              <YouTubeResults
                hits={youtubeHits}
                loading={youtubeLoading}
                query={query}
              />
            )}
          </>
        ) : canExtract && (youtubeLoading || youtubeHits.length > 0) ? (
          <YouTubeResults hits={youtubeHits} loading={youtubeLoading} query={query} standalone />
        ) : (
          <NoResultsState query={query} />
        )}
      </ScrollView>
    </View>
  );
}
