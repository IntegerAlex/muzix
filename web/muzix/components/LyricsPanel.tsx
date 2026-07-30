import { useEffect, useRef, useState, useCallback } from 'react';
import { ScrollView, Pressable, Text, View, Alert } from 'react-native';
import Animated, { useSharedValue, withTiming, Easing, useAnimatedStyle } from 'react-native-reanimated';
import { Check, Share2, X } from 'lucide-react-native';

interface LyricLine {
  time: number; // seconds
  text: string;
}

interface LyricsPanelProps {
  lyrics: string;
  currentTime: number; // seconds
  duration: number; // seconds
  onSeek?: (time: number) => void;
  onShare?: (selectedTexts: string[], shareMode: 'image' | 'text') => void;
}

function parseLRC(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/g;
  let match;
  while ((match = regex.exec(lrc)) !== null) {
    const min = parseInt(match[1], 10);
    const sec = parseInt(match[2], 10);
    const ms = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
    const time = min * 60 + sec + ms / 1000;
    const text = match[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

function isLRC(text: string): boolean {
  return /\[\d{1,2}:\d{2}/.test(text);
}

function plainTextToLines(text: string): LyricLine[] {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((line, i, arr) => ({
      time: (i / arr.length) * 100, // distribute evenly across 100s
      text: line.trim(),
    }));
}

export function LyricsPanel({ lyrics, currentTime, duration, onSeek, onShare }: LyricsPanelProps) {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<ScrollView>(null);
  const lineRefs = useRef(new Map<number, View>());
  const [shareMode, setShareMode] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [shareImageMode, setShareImageMode] = useState(true);

  useEffect(() => {
    if (!lyrics) {
      setLines([]);
      return;
    }
    const parsed = isLRC(lyrics) ? parseLRC(lyrics) : plainTextToLines(lyrics);
    setLines(parsed);
  }, [lyrics]);

  useEffect(() => {
    if (lines.length === 0) return;
    let idx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (currentTime >= lines[i].time) {
        idx = i;
        break;
      }
    }
    if (idx !== activeIndex) {
      setActiveIndex(idx);
      if (!userScrolling && idx >= 0 && !shareMode) {
        const lineView = lineRefs.current.get(idx);
        if (lineView) {
          // @ts-ignore - measure is available on View
          lineView?.measure?.((_x: number, y: number, _w: number, _h: number, _px: number, py: number) => {
            listRef.current?.scrollTo({ y: Math.max(0, py - 120), animated: true });
          });
        }
      }
    }
  }, [currentTime, lines, activeIndex, userScrolling, shareMode]);

  const handleScrollBegin = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  }, []);

  const handleScrollEnd = useCallback(() => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => setUserScrolling(false), 3000);
  }, []);

  const handleLinePress = useCallback(
    (time: number, index: number) => {
      if (shareMode) {
        setSelectedIndices((prev) => {
          const next = new Set(prev);
          if (next.has(index)) {
            next.delete(index);
          } else {
            if (next.size >= 5) {
              Alert.alert('Maximum lines reached', 'You can select up to 5 lines to share.');
              return prev;
            }
            next.add(index);
          }
          return next;
        });
      } else {
        onSeek?.(time);
        setUserScrolling(false);
      }
    },
    [onSeek, shareMode]
  );

  const handleShareConfirm = useCallback(() => {
    const selected = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map((i) => lines[i].text);
    if (selected.length === 0) {
      Alert.alert('No lines selected', 'Tap on lyrics lines to select them before sharing.');
      return;
    }
    onShare?.(selected, shareImageMode ? 'image' : 'text');
    setShareMode(false);
    setSelectedIndices(new Set());
    setShareImageMode(true);
  }, [selectedIndices, lines, onShare, shareImageMode]);

  const handleShareCancel = useCallback(() => {
    setShareMode(false);
    setSelectedIndices(new Set());
    setShareImageMode(true);
  }, []);

  const toggleShareMode = useCallback(() => {
    setShareMode((v) => !v);
    setSelectedIndices(new Set());
    setShareImageMode(true);
  }, []);

  if (lines.length === 0) {
    return (
      <View style={{ paddingVertical: 40, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.35)' }}>
          No lyrics available
        </Text>
      </View>
    );
  }

  return (
    <View>
      {shareMode ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 8 }}>
          <Pressable onPress={handleShareCancel} hitSlop={8} accessibilityLabel="Cancel" accessibilityRole="button">
            <Text style={{ fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.5)' }}>Cancel</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selectedIndices.size > 0 && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Pressable
                  onPress={() => setShareImageMode(true)}
                  hitSlop={8}
                  accessibilityLabel="Share as image"
                  accessibilityRole="button"
                >
                  <Text style={{
                    fontSize: 12, fontWeight: '600',
                    color: shareImageMode ? 'white' : 'rgba(255,255,255,0.4)',
                    backgroundColor: shareImageMode ? '#1DB954' : 'transparent',
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999,
                  }}>Image</Text>
                </Pressable>
                <Pressable
                  onPress={() => setShareImageMode(false)}
                  hitSlop={8}
                  accessibilityLabel="Share as text"
                  accessibilityRole="button"
                >
                  <Text style={{
                    fontSize: 12, fontWeight: '600',
                    color: !shareImageMode ? 'white' : 'rgba(255,255,255,0.4)',
                    backgroundColor: !shareImageMode ? '#1DB954' : 'transparent',
                    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 9999,
                  }}>Text</Text>
                </Pressable>
              </View>
            )}
            <Text style={{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>
              {selectedIndices.size} selected
            </Text>
          </View>
          <Pressable onPress={handleShareConfirm} hitSlop={8} accessibilityLabel="Share" accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1DB954', borderRadius: 9999, paddingHorizontal: 14, paddingVertical: 6 }}>
              <Share2 size={12} color="white" />
              <Text style={{ fontSize: 13, fontWeight: '600', color: 'white' }}>
                {shareImageMode ? 'Share' : 'Share as text'}
              </Text>
            </View>
          </Pressable>
        </View>
      ) : onShare && (
        <View style={{ alignItems: 'flex-end', paddingBottom: 4 }}>
          <Pressable onPress={toggleShareMode} hitSlop={8} accessibilityLabel="Share lyrics" accessibilityRole="button">
            <Share2 size={16} color="rgba(255,255,255,0.35)" />
          </Pressable>
        </View>
      )}
      <ScrollView
        ref={listRef}
        style={{ maxHeight: 300 }}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
        scrollEnabled={!shareMode}
      >
        <View style={{ paddingVertical: 20 }}>
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const isPast = i < activeIndex;

            return (
              <Pressable
                key={`${i}-${line.time}`}
                ref={(ref) => { if (ref) lineRefs.current.set(i, ref); }}
                onPress={() => handleLinePress(line.time, i)}
                style={{ paddingVertical: 6, paddingHorizontal: 4 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {shareMode && (
                    <View style={{
                      width: 20, height: 20, borderRadius: 4, borderWidth: 2,
                      borderColor: selectedIndices.has(i) ? '#1DB954' : 'rgba(255,255,255,0.3)',
                      backgroundColor: selectedIndices.has(i) ? '#1DB954' : 'transparent',
                      justifyContent: 'center', alignItems: 'center',
                    }}>
                      {selectedIndices.has(i) && <Check size={14} color="white" strokeWidth={3} />}
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <AnimatedLine
                      text={line.text}
                      isActive={isActive}
                      isPast={isPast}
                    />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function AnimatedLine({ text, isActive, isPast }: { text: string; isActive: boolean; isPast: boolean }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = isActive ? withTiming(1.05, { duration: 200, easing: Easing.out(Easing.ease) }) : withTiming(1, { duration: 200 });
  }, [isActive]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <Text
        style={{
          fontSize: isActive ? 20 : 16,
          fontWeight: isActive ? '700' : '400',
          color: isActive ? 'white' : isPast ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)',
          lineHeight: 28,
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

export function formatTimeVerbose(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
