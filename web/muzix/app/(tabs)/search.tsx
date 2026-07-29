import { useState, useCallback, useEffect } from 'react';
import { Link, type Href } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, TextInput } from 'react-native';
import { View, Text, XStack } from 'tamagui';
import { Search } from 'lucide-react-native';
import { SongRow } from '@/components/SongRow';
import { SectionHeader } from '@/components/SectionHeader';
import { SongSkeleton } from '@/components/Skeleton';
import { useSearch } from '@/services/data';
import type { Album, Artist } from '@/services/types';
import { usePlayerStore } from '@/store/playerStore';
import { AnimatedEntrance } from '@/lib/useEntrance';
import { Artwork } from '@/components/Artwork';
import { RADIUS } from '@/lib/sizing';
import { CARD_BG, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

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

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(loadRecent);
  const playSong = usePlayerStore((s) => s.playSong);
  const current = usePlayerStore((s) => s.current);

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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: 96, paddingTop: 64 }}
      >
        <Text fontSize={28} fontWeight="700" letterSpacing={-0.6} color={TEXT_PRIMARY}>Search</Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Songs, artists, albums…"
          placeholderTextColor={TEXT_MUTED}
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
        />

        {!hasQuery ? (
          <>
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Search size={48} color={TEXT_MUTED} strokeWidth={1.5} />
              <Text style={{ marginTop: 16, textAlign: 'center' }} fontSize={15} color={TEXT_MUTED}>
                What do you want to listen to?
              </Text>
            </View>
            {recentSearches.length > 0 && (
              <View style={{ marginTop: SPACING.xxl }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md, marginTop: SPACING.xxxl }}>
                  <Text fontSize={20} fontWeight="700" color={TEXT_PRIMARY}>Recent</Text>
                  <Pressable onPress={clearRecent} accessibilityLabel="Clear recent searches" accessibilityRole="button">
                    <Text fontSize={14} fontWeight="500" color={TEXT_SECONDARY}>Clear</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                  {recentSearches.map((term) => (
                    <Pressable
                      key={term}
                      onPress={() => handleRecentPress(term)}
                      style={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 16, backgroundColor: CARD_BG, borderWidth: 1, borderColor: BORDER }}
                      accessibilityLabel={`Search ${term}`}
                      accessibilityRole="button"
                    >
                      <Text fontSize={13} fontWeight="500" color={TEXT_PRIMARY}>{term}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : loading ? (
          <View style={{ paddingTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: 12 }}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text fontSize={13} color={TEXT_MUTED}>Searching…</Text>
            </View>
            {[1, 2, 3, 4, 5].map((i) => <SongSkeleton key={i} />)}
          </View>
         ) : hasResults ? (
           <>
             {results.songs.map((songItem, i) => (
               <AnimatedEntrance key={songItem.id} index={i}>
                 <SongRow
                   song={songItem}
                   index={i}
                   queue={results.songs}
                  isCurrent={current?.id === songItem.id}
                />
              </AnimatedEntrance>
            ))}

            {results.albums.length > 0 && <SectionHeader title="Albums" />}
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

            {results.artists.length > 0 && <SectionHeader title="Artists" />}
            {results.artists.map((artist, i) => (
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
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Search size={48} color={TEXT_MUTED} strokeWidth={1.5} />
            <Text style={{ marginTop: SPACING.md, textAlign: 'center', fontWeight: '500' }} fontSize={15} color={TEXT_SECONDARY}>
              No results for "{query.trim()}"
            </Text>
            <Text style={{ marginTop: SPACING.sm, textAlign: 'center' }} fontSize={13} color={TEXT_MUTED}>
              Try different keywords or check the spelling
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
