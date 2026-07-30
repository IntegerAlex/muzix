import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Modal, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';

import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import {
  Pause, Play, SkipBack, SkipForward, ChevronDown,
  Shuffle, Repeat, Repeat1, Heart,
  VolumeX, Volume2, AlertCircle, Share2,
} from '@/lib/icons';
import { View, Text } from 'tamagui';
import { useShallow } from 'zustand/react/shallow';
import { Artwork } from '@/components/Artwork';
import { GlassCard } from '@/components/GlassCard';
import { LyricsPanel } from '@/components/LyricsPanel';
import { LyricsImageGenerator } from '@/components/LyricsImageGenerator';
import { useLyricsSharing } from '@/hooks/useLyricsSharing';
import { useSharing } from '@/hooks/useSharing';
import { usePlayerStore } from '@/store/playerStore';
import type { Song } from '@/services/types';
import { formatTime } from '@/lib/utils';
import { SURFACE_ICON, BORDER, ACCENT } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { useResponsive } from '@/lib/useResponsive';

export function NowPlaying() {
  const insets = useSafeAreaInsets();
  const { orientation, isDesktop, isTablet } = useResponsive();
  const isLandscape = orientation === 'landscape';
  const isWide = (isTablet || isDesktop) && isLandscape;
  const [showLyrics, setShowLyrics] = useState(false);

  const { current, loadingId, error } = usePlayerStore(
    useShallow((s) => ({ current: s.current, loadingId: s.loadingId, error: s.error }))
  );
  const { isPlaying, shuffle, repeat, volume } = usePlayerStore(
    useShallow((s) => ({ isPlaying: s.isPlaying, shuffle: s.shuffle, repeat: s.repeat, volume: s.volume }))
  );
  const { queue, currentIndex, showNowPlaying } = usePlayerStore(
    useShallow((s) => ({ queue: s.queue, currentIndex: s.currentIndex, showNowPlaying: s.showNowPlaying }))
  );
  const { setShowNowPlaying, setPlaying, next, previous, playSong, toggleShuffle, toggleRepeat, toggleLike, setVolume, setSeekPosition, retry } = usePlayerStore(
    useShallow((s) => ({
      setShowNowPlaying: s.setShowNowPlaying,
      setPlaying: s.setPlaying,
      next: s.next,
      previous: s.previous,
      playSong: s.playSong,
      toggleShuffle: s.toggleShuffle,
      toggleRepeat: s.toggleRepeat,
      toggleLike: s.toggleLike,
      setVolume: s.setVolume,
      setSeekPosition: s.setSeekPosition,
      retry: s.retry,
    }))
  );
  const likedSongs = usePlayerStore(
    useShallow((s) => s.likedSongs)
  );

  const pulse = useSharedValue(1);
  const progress = useSharedValue(0);
  const lastSeek = useRef<number | null>(null);
  const [elapsedText, setElapsedText] = useState('0:00');
  const [progressPct, setProgressPct] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [selectedLyrics, setSelectedLyrics] = useState<string[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);
  const { imageRef, generate, isGenerating, shareError } = useLyricsSharing();
  const { share } = useSharing();

  const isLiked = current ? !!likedSongs[current.id] : false;

  const upNext = useMemo(
    () => queue.slice(currentIndex + 1, currentIndex + 4),
    [queue, currentIndex]
  );

  const updateElapsed = (value: number) => {
    if (current) {
      setElapsedText(formatTime(value * current.durationMs));
      setCurrentTimeSec(value * (current.durationMs / 1000));
    }
  };

  useAnimatedReaction(
    () => progress.value,
    (value) => runOnJS(updateElapsed)(value)
  );

  useAnimatedReaction(
    () => progress.value,
    (v) => {
      if (!scrubbing) runOnJS(setProgressPct)(Math.round(v * 100));
    }
  );

  useEffect(() => {
    if (isPlaying) {
      pulse.value = withRepeat(
        withTiming(1.03, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        -1, true
      );
    } else {
      pulse.value = withTiming(1, { duration: 500 });
    }
  }, [isPlaying, pulse]);

  useEffect(() => {
    progress.value = 0;
    if (current && isPlaying && !error && loadingId !== current.id) {
      progress.value = withTiming(1, { duration: current.durationMs, easing: Easing.linear });
    }
  }, [current?.id, loadingId]);

  useEffect(() => {
    if (!current || error) return;
    if (isPlaying && loadingId !== current.id) {
      const remainingMs = (1 - progress.value) * current.durationMs;
      if (remainingMs > 0) {
        progress.value = withTiming(1, { duration: remainingMs, easing: Easing.linear });
      }
    } else {
      progress.value = progress.value;
    }
  }, [isPlaying, loadingId]);

  const seekPosition = usePlayerStore((s) => s.seekPosition);

  useEffect(() => {
    if (seekPosition == null || !current) return;
    if (seekPosition === lastSeek.current) return;
    lastSeek.current = seekPosition;
    const fraction = Math.min(1, Math.max(0, seekPosition));
    progress.value = fraction;
    if (isPlaying && loadingId !== current.id) {
      const remainingMs = (1 - fraction) * current.durationMs;
      progress.value = withTiming(1, { duration: remainingMs, easing: Easing.linear });
    }
  }, [seekPosition, current, isPlaying, progress, loadingId]);

  useEffect(() => {
    if (selectedLyrics.length > 0) {
      const timer = setTimeout(async () => {
        const uri = await generate();
        if (uri) {
          setPreviewUri(uri);
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [selectedLyrics, generate]);

  const handleShareLyrics = useCallback(
    async (selectedTexts: string[], mode: 'image' | 'text') => {
      if (mode === 'text') {
        if (!current) return;
        try {
          await share({
            contentType: 'lyrics',
            contentId: current.id,
            title: current.title,
            artist: current.artist,
            lyrics: selectedTexts,
            selectedLyricsLines: selectedTexts.map(
              t => current.lyrics?.split('\n').indexOf(t) ?? 0
            ),
          });
          setShareSuccess(true);
          setTimeout(() => setShareSuccess(false), 2000);
        } catch {}
      } else {
        setSelectedLyrics(selectedTexts);
      }
    },
    [current, share]
  );

  const handleRetryGenerate = useCallback(async () => {
    const uri = await generate();
    if (uri) {
      setPreviewUri(uri);
    }
  }, [generate]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const likeScale = useSharedValue(1);
  const likeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  if (!current || !showNowPlaying) return null;

  if (isWide) {
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' }}
          onPress={() => setShowNowPlaying(false)}
        />
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          paddingTop: insets.top, paddingBottom: insets.bottom,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACING.xl, paddingVertical: SPACING.sm }}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, backgroundColor: SURFACE_ICON, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}
              onPress={() => setShowNowPlaying(false)}
            >
              <ChevronDown size={18} color="rgba(255,255,255,0.7)" />
              <Text fontSize={13} fontWeight="500" color="rgba(255,255,255,0.7)">Dismiss</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text fontSize={13} fontWeight="600" color="rgba(255,255,255,0.8)" numberOfLines={1}>
                {current.album}
              </Text>
            </View>
            <Pressable
              onPress={() => share({ contentType: 'song', contentId: current.id, title: current.title, artist: current.artist, imageUrl: current.imageUrl })}
              hitSlop={8}
              accessibilityLabel="Share"
            >
              <Share2 size={20} color={ACCENT} />
            </Pressable>
          </View>

          <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: SPACING.xl }}>
            <View style={{ flex: 0.4, justifyContent: 'center', alignItems: 'center', paddingRight: SPACING.xl }}>
              <Animated.View style={pulseStyle}>
                <Artwork
                  source={current.imageUrl ? { uri: current.imageUrl } : undefined}
                  colors={current.colors}
                  style={{ height: 240, width: 240, borderRadius: 24 }}
                  radius={24}
                />
              </Animated.View>
              <View style={{ marginTop: SPACING.lg, alignItems: 'center', width: '100%' }}>
                <Text fontSize={20} fontWeight="700" letterSpacing={-0.5} color="white" numberOfLines={1}>
                  {current.title}
                </Text>
                <Text fontSize={14} fontWeight="500" color="rgba(255,255,255,0.5)" numberOfLines={1}>
                  {current.artist}
                </Text>
              </View>

              {error ? (
                <View style={{ marginTop: 24, alignItems: 'center', gap: 12 }} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <AlertCircle size={32} color="#f43f5e" />
                  <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>{error}</Text>
                  <Pressable
                    onPress={retry}
                    style={{ backgroundColor: SURFACE_ICON, borderRadius: 9999, paddingHorizontal: 24, paddingVertical: 10 }}
                  >
                    <Text fontSize={14} fontWeight="600" color="white">Retry</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={{ marginTop: SPACING.lg, width: '100%' }}>
                  <Slider
                    minimumValue={0}
                    maximumValue={1}
                    minimumTrackTintColor="white"
                    maximumTrackTintColor="rgba(255,255,255,0.12)"
                    thumbTintColor="white"
                    value={scrubbing ? scrubValue : progressPct / 100}
                    onSlidingStart={(v) => { setScrubbing(true); setScrubValue(v); }}
                    onValueChange={(v) => setScrubValue(v)}
                    onSlidingComplete={(v) => {
                      setScrubbing(false);
                      setSeekPosition(v);
                      setProgressPct(Math.round(v * 100));
                      if (current) setElapsedText(formatTime(v * current.durationMs));
                    }}
                    style={{ flex: 1, height: 28 }}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text fontSize={11} fontWeight="500" color="rgba(255,255,255,0.4)">
                      {scrubbing ? formatTime(scrubValue * current.durationMs) : elapsedText}
                    </Text>
                    <Text fontSize={11} fontWeight="500" color="rgba(255,255,255,0.4)">{current.duration}</Text>
                  </View>
                </View>
              )}

              <View style={{ marginTop: SPACING.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
                <Pressable onPress={toggleShuffle} hitSlop={12} accessibilityLabel="Shuffle" accessibilityHint="Toggle shuffle mode" accessibilityRole="button">
                  <Shuffle size={18} color={shuffle ? '#1DB954' : 'rgba(255,255,255,0.35)'} strokeWidth={shuffle ? 2.5 : 1.8} />
                </Pressable>
                <Pressable onPress={previous} hitSlop={12} accessibilityLabel="Previous track" accessibilityHint="Play previous track" accessibilityRole="button">
                  <SkipBack size={26} color="white" fill="white" />
                </Pressable>
                <Pressable
                  onPress={() => setPlaying(!isPlaying)}
                  style={{ alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: 'white', width: 56, height: 56 }}
                  hitSlop={12}
                >
                  {loadingId === current.id ? (
                    <ActivityIndicator color="#000" />
                  ) : isPlaying ? (
                    <Pause size={24} color="#000" fill="#000" />
                  ) : (
                    <Play size={24} color="#000" fill="#000" style={{ marginLeft: 3 }} />
                  )}
                </Pressable>
                <Pressable onPress={next} hitSlop={12}>
                  <SkipForward size={26} color="white" fill="white" />
                </Pressable>
                <Pressable onPress={toggleRepeat} hitSlop={12} accessibilityLabel="Repeat" accessibilityHint="Toggle repeat mode" accessibilityRole="button">
                  {repeat === 'one' ? (
                    <Repeat1 size={18} color="#1DB954" strokeWidth={2.5} />
                  ) : (
                    <Repeat size={18} color={repeat === 'all' ? '#1DB954' : 'rgba(255,255,255,0.35)'} strokeWidth={repeat === 'all' ? 2.5 : 1.8} />
                  )}
                </Pressable>
              </View>

              <View style={{ marginTop: SPACING.md, flexDirection: 'row', alignItems: 'center', gap: 12, width: '80%' }}>
                <VolumeX size={14} color="rgba(255,255,255,0.35)" />
                <Slider
                  value={volume}
                  onValueChange={setVolume}
                  minimumValue={0}
                  maximumValue={1}
                  minimumTrackTintColor="rgba(255,255,255,0.6)"
                  maximumTrackTintColor="rgba(255,255,255,0.12)"
                  thumbTintColor="white"
                  style={{ flex: 1, height: 28 }}
                  accessibilityLabel="Volume control"
                />
                <Volume2 size={14} color="rgba(255,255,255,0.35)" />
              </View>
            </View>

            <View style={{ flex: 0.6, paddingLeft: SPACING.xl, borderLeftWidth: 1, borderLeftColor: BORDER }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {current.lyrics ? (
                  <LyricsPanel
                    lyrics={current.lyrics}
                    currentTime={currentTimeSec}
                    duration={current.durationMs / 1000}
                    onSeek={(t) => {
                      if (current) setSeekPosition(t / (current.durationMs / 1000));
                    }}
                    onShare={handleShareLyrics}
                  />
                ) : (
                  <View style={{ paddingVertical: SPACING.xl, alignItems: 'center' }}>
                    <Text fontSize={14} color="rgba(255,255,255,0.3)">No lyrics available</Text>
                  </View>
                )}
                {upNext.length > 0 && (
                  <View style={{ marginTop: current.lyrics ? SPACING.xl : 0 }}>
                    <Text fontSize={13} fontWeight="600" color="rgba(255,255,255,0.6)" style={{ marginBottom: SPACING.sm }}>
                      Up Next
                    </Text>
                    {upNext.map((item: Song, i) => (
                      <Pressable
                        key={item.id}
                        onPress={() => playSong(item, queue, currentIndex + 1 + i)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                      >
                        <Artwork source={item.imageUrl ? { uri: item.imageUrl } : undefined} colors={item.colors} style={{ height: 40, width: 40 }} radius={8} />
                        <View style={{ flex: 1 }}>
                          <Text fontSize={13} fontWeight="500" color="white" numberOfLines={1}>{item.title}</Text>
                          <Text fontSize={11} color="rgba(255,255,255,0.4)" numberOfLines={1}>{item.artist}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
        {current && (
          <LyricsImageGenerator
            ref={imageRef}
            lines={selectedLyrics}
            title={current.title}
            artist={current.artist}
            imageUrl={current.imageUrl}
            colors={current.colors}
            timestamp={elapsedText}
          />
        )}
        {isGenerating && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100,
          }}>
            <ActivityIndicator size="large" color="white" />
            <Text style={{ marginTop: 16, fontSize: 16, color: 'white' }}>Generating share image...</Text>
          </View>
        )}
        {previewUri && (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setPreviewUri(null)}
          >
            <TouchableOpacity
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.7)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={() => setPreviewUri(null)}
              activeOpacity={1}
            >
              <View style={{
                backgroundColor: '#1a1a1a',
                borderRadius: 20,
                padding: SPACING.xxl,
                width: '90%',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: BORDER,
              }}>
                <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 16 }}>
                  Share Lyrics
                </Text>
                <Image
                  source={{ uri: previewUri }}
                  style={{
                    width: '100%',
                    height: 200,
                    borderRadius: 12,
                    resizeMode: 'cover',
                  }}
                />
                {shareError && (
                  <Text style={{ color: '#f43f5e', fontSize: 13, marginTop: 8, marginBottom: 8 }}>
                    {shareError}
                  </Text>
                )}
                {shareError ? (
                  <TouchableOpacity
                    style={{
                      backgroundColor: SURFACE_ICON,
                      borderRadius: 12,
                      paddingVertical: SPACING.md,
                      paddingHorizontal: SPACING.xxl,
                      marginBottom: 12,
                      width: '100%',
                      alignItems: 'center',
                    }}
                    onPress={handleRetryGenerate}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
                      Retry
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#1DB954',
                      borderRadius: 12,
                      paddingVertical: SPACING.md,
                      paddingHorizontal: SPACING.xxl,
                      marginTop: 16,
                      marginBottom: 12,
                      width: '100%',
                      alignItems: 'center',
                    }}
                    onPress={async () => {
                      await share({ contentType: 'lyrics', contentId: current.id, title: current.title, artist: current.artist, imageUrl: current.imageUrl, lyrics: selectedLyrics });
                      setPreviewUri(null);
                      setSelectedLyrics([]);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
                      Share via...
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{
                    backgroundColor: SURFACE_ICON,
                    borderRadius: 12,
                    paddingVertical: SPACING.md,
                    paddingHorizontal: SPACING.xxl,
                    width: '100%',
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setPreviewUri(null);
                    setSelectedLyrics([]);
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.7)' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Modal>
        )}
        {shareSuccess && (
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 200,
          }}>
            <View style={{
              backgroundColor: '#1DB954',
              borderRadius: 16,
              paddingVertical: 20,
              paddingHorizontal: 32,
              alignItems: 'center',
              gap: 8,
            }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Shared!</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50, pointerEvents: 'box-none' }}>
      <Pressable
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' }}
        onPress={() => setShowNowPlaying(false)}
        accessibilityLabel="Dismiss now playing"
        accessibilityRole="button"
      />
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'box-none',
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SPACING.xxl, paddingTop: SPACING.sm, paddingBottom: SPACING.xxxl }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9999, backgroundColor: SURFACE_ICON, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}
              hitSlop={8}
              onPress={() => setShowNowPlaying(false)}
              accessibilityLabel="Dismiss"
              accessibilityRole="button"
            >
              <ChevronDown size={18} color="rgba(255,255,255,0.7)" />
              <Text fontSize={13} fontWeight="500" color="rgba(255,255,255,0.7)">Dismiss</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text fontSize={13} fontWeight="600" color="rgba(255,255,255,0.8)" numberOfLines={1}>
                {current.album}
              </Text>
            </View>
            <Pressable
              onPress={() => share({ contentType: 'song', contentId: current.id, title: current.title, artist: current.artist, imageUrl: current.imageUrl })}
              hitSlop={8}
              accessibilityLabel="Share"
            >
              <Share2 size={20} color={ACCENT} />
            </Pressable>
          </View>

          <View style={{ alignItems: 'center', paddingVertical: 32 }}>
            <Animated.View style={pulseStyle}>
              <Artwork
                source={current.imageUrl ? { uri: current.imageUrl } : undefined}
                colors={current.colors}
                style={{ height: 280, width: 280, borderRadius: 28 }}
                radius={28}
              />
            </Animated.View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text fontSize={22} fontWeight="700" letterSpacing={-0.5} color="white" numberOfLines={1}>
                {current.title}
              </Text>
              <Text style={{ marginTop: 2 }} fontSize={15} fontWeight="500" color="rgba(255,255,255,0.5)" numberOfLines={1}>
                {current.artist}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                likeScale.value = withSpring(1.3, { damping: 10, stiffness: 400 }, () => {
                  likeScale.value = withSpring(1, { damping: 15, stiffness: 300 });
                });
                toggleLike(current.id);
              }}
              hitSlop={12}
              accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
              accessibilityRole="button"
            >
              <Animated.View style={likeStyle}>
                <Heart
                  size={24}
                  color={isLiked ? '#f43f5e' : 'rgba(255,255,255,0.4)'}
                  fill={isLiked ? '#f43f5e' : 'transparent'}
                />
              </Animated.View>
            </Pressable>
          </View>

          {error ? (
            <View style={{ marginTop: 24, alignItems: 'center', gap: 12 }} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <AlertCircle size={32} color="#f43f5e" />
              <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", textAlign: "center" }}>{error}</Text>
              <Pressable
                onPress={retry}
                style={{ backgroundColor: SURFACE_ICON, borderRadius: 9999, paddingHorizontal: 24, paddingVertical: 10 }}
                accessibilityLabel="Retry playback"
                accessibilityRole="button"
              >
                <Text fontSize={14} fontWeight="600" color="white">Retry</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ marginTop: 20 }}>
              <Slider
                minimumValue={0}
                maximumValue={1}
                minimumTrackTintColor="white"
                maximumTrackTintColor="rgba(255,255,255,0.12)"
                thumbTintColor="white"
                value={scrubbing ? scrubValue : progressPct / 100}
                onSlidingStart={(v) => {
                  setScrubbing(true);
                  setScrubValue(v);
                }}
                onValueChange={(v) => {
                  setScrubValue(v);
                }}
                onSlidingComplete={(v) => {
                  setScrubbing(false);
                  setSeekPosition(v);
                  setProgressPct(Math.round(v * 100));
                  if (current) setElapsedText(formatTime(v * current.durationMs));
                }}
                style={{ flex: 1, height: 28 }}
                accessibilityLabel="Seek"
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text fontSize={11} fontWeight="500" color="rgba(255,255,255,0.4)">
                  {scrubbing ? formatTime(scrubValue * current.durationMs) : elapsedText}
                </Text>
                <Text fontSize={11} fontWeight="500" color="rgba(255,255,255,0.4)">{current.duration}</Text>
              </View>
            </View>
          )}

          <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
            <Pressable
              onPress={toggleShuffle}
              hitSlop={12}
              accessibilityLabel={shuffle ? 'Shuffle on' : 'Shuffle off'}
              accessibilityRole="button"
            >
              <Shuffle
                size={20}
                color={shuffle ? '#1DB954' : 'rgba(255,255,255,0.35)'}
                strokeWidth={shuffle ? 2.5 : 1.8}
              />
            </Pressable>

            <Pressable onPress={previous} hitSlop={12} accessibilityLabel="Previous track" accessibilityRole="button">
              <SkipBack size={30} color="white" fill="white" />
            </Pressable>

            <Pressable
                onPress={() => setPlaying(!isPlaying)}
                style={{ alignItems: 'center', justifyContent: 'center', borderRadius: 9999, backgroundColor: 'white', width: 64, height: 64 }}
                hitSlop={12}
                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                accessibilityRole="button"
              >
                {loadingId === current.id ? (
                  <ActivityIndicator color="#000" />
                ) : isPlaying ? (
                  <Pause size={28} color="#000" fill="#000" />
                ) : (
                  <Play size={28} color="#000" fill="#000" style={{ marginLeft: 3 }} />
                )}
              </Pressable>

            <Pressable onPress={next} hitSlop={12} accessibilityLabel="Next track" accessibilityRole="button">
              <SkipForward size={30} color="white" fill="white" />
            </Pressable>

            <Pressable
              onPress={toggleRepeat}
              hitSlop={12}
              accessibilityLabel={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
              accessibilityRole="button"
            >
              {repeat === 'one' ? (
                <Repeat1 size={20} color="#1DB954" strokeWidth={2.5} />
              ) : (
                <Repeat
                  size={20}
                  color={repeat === 'all' ? '#1DB954' : 'rgba(255,255,255,0.35)'}
                  strokeWidth={repeat === 'all' ? 2.5 : 1.8}
                />
              )}
            </Pressable>
          </View>

          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <VolumeX size={14} color="rgba(255,255,255,0.35)" />
            <Slider
              value={volume}
              onValueChange={setVolume}
              minimumValue={0}
              maximumValue={1}
              minimumTrackTintColor="rgba(255,255,255,0.6)"
              maximumTrackTintColor="rgba(255,255,255,0.12)"
              thumbTintColor="white"
              style={{ flex: 1, height: 28 }}
              accessibilityLabel="Volume control"
            />
            <Volume2 size={14} color="rgba(255,255,255,0.35)" />
          </View>

          {upNext.length > 0 && (
            <GlassCard variant="glass" padding={SPACING.md} intensity={30} style={{ marginTop: 24 }}>
              <Text style={{ marginBottom: 8 }} fontSize={13} fontWeight="600" color="rgba(255,255,255,0.6)">Up Next</Text>
              {upNext.map((item: Song, i) => (
                <Pressable
                  key={item.id}
                  onPress={() => playSong(item, queue, currentIndex + 1 + i)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                  accessibilityLabel={`Play ${item.title} by ${item.artist}`}
                  accessibilityRole="button"
                >
                  <Artwork source={item.imageUrl ? { uri: item.imageUrl } : undefined} colors={item.colors} style={{ height: 40, width: 40 }} radius={8} />
                  <View style={{ flex: 1 }}>
                    <Text fontSize={13} fontWeight="500" color="white" numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text fontSize={11} color="rgba(255,255,255,0.4)" numberOfLines={1}>
                      {item.artist}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </GlassCard>
          )}

          {current.lyrics && (
            <View style={{ marginTop: 20 }}>
              <Pressable
                onPress={() => setShowLyrics((v) => !v)}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                accessibilityLabel={showLyrics ? 'Hide lyrics' : 'Show lyrics'}
                accessibilityRole="button"
              >
                <Text fontSize={15} fontWeight="600" color="rgba(255,255,255,0.7)">Lyrics</Text>
                <Text fontSize={13} fontWeight="500" color="rgba(255,255,255,0.35)">{showLyrics ? 'Hide' : 'Show'}</Text>
              </Pressable>
              {showLyrics && (
                <GlassCard variant="glass" padding={SPACING.sm} intensity={25} style={{ marginTop: 12 }}>
                  <LyricsPanel
                    lyrics={current.lyrics}
                    currentTime={currentTimeSec}
                    duration={current.durationMs / 1000}
                    onSeek={(t) => {
                      if (current) {
                        setSeekPosition(t / (current.durationMs / 1000));
                      }
                    }}
                    onShare={handleShareLyrics}
                  />
                </GlassCard>
              )}
            </View>
          )}
        </ScrollView>
      </View>
      {current && (
        <LyricsImageGenerator
          ref={imageRef}
          lines={selectedLyrics}
          title={current.title}
          artist={current.artist}
          imageUrl={current.imageUrl}
          colors={current.colors}
          timestamp={elapsedText}
        />
      )}
      {isGenerating && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 100,
        }}>
          <ActivityIndicator size="large" color="white" />
          <Text style={{ marginTop: 16, fontSize: 16, color: 'white' }}>Generating share image...</Text>
        </View>
      )}
      {previewUri && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPreviewUri(null)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.7)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            onPress={() => setPreviewUri(null)}
            activeOpacity={1}
          >
            <View style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 20,
              padding: SPACING.xxl,
              width: '90%',
              alignItems: 'center',
              borderWidth: 1,
              borderColor: BORDER,
            }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: 'white', marginBottom: 16 }}>
                Share Lyrics
              </Text>
                <Image
                  source={{ uri: previewUri }}
                  style={{
                    width: '100%',
                    height: 200,
                    borderRadius: 12,
                    resizeMode: 'cover',
                  }}
                />
                {shareError && (
                  <Text style={{ color: '#f43f5e', fontSize: 13, marginTop: 8, marginBottom: 8 }}>
                    {shareError}
                  </Text>
                )}
                {shareError ? (
                  <TouchableOpacity
                    style={{
                      backgroundColor: SURFACE_ICON,
                      borderRadius: 12,
                      paddingVertical: SPACING.md,
                      paddingHorizontal: SPACING.xxl,
                      marginBottom: 12,
                      width: '100%',
                      alignItems: 'center',
                    }}
                    onPress={handleRetryGenerate}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
                      Retry
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#1DB954',
                      borderRadius: 12,
                      paddingVertical: SPACING.md,
                      paddingHorizontal: SPACING.xxl,
                      marginTop: 16,
                      marginBottom: 12,
                      width: '100%',
                      alignItems: 'center',
                    }}
                    onPress={async () => {
                      await share({ contentType: 'lyrics', contentId: current.id, title: current.title, artist: current.artist, imageUrl: current.imageUrl, lyrics: selectedLyrics });
                      setPreviewUri(null);
                      setSelectedLyrics([]);
                    }}
                  >
                    <Text style={{ fontSize: 16, fontWeight: '600', color: 'white' }}>
                      Share via...
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={{
                    backgroundColor: SURFACE_ICON,
                    borderRadius: 12,
                    paddingVertical: SPACING.md,
                    paddingHorizontal: SPACING.xxl,
                    width: '100%',
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    setPreviewUri(null);
                    setSelectedLyrics([]);
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '500', color: 'rgba(255,255,255,0.7)' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
      {shareSuccess && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 200,
        }}>
          <View style={{
            backgroundColor: '#1DB954',
            borderRadius: 16,
            paddingVertical: 20,
            paddingHorizontal: 32,
            alignItems: 'center',
            gap: 8,
          }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>Shared!</Text>
          </View>
        </View>
      )}
    </View>
  );
}
