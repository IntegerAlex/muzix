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
import { BG, SURFACE, CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { useResponsive } from '@/lib/useResponsive';
import { SPACING } from '@/lib/spacing';
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
          <SearchResults
            results={results}
            current={current}
            onShare={handleShare}
            isSharing={isSharing}
            showSongs={true}
            showAlbums={true}
            showArtists={true}
          />
        ) : (
          <NoResultsState query={query} />
        )}
      </ScrollView>
    </View>
  );
}
