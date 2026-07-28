import { useEffect, useRef, useState, useCallback } from 'react';
import { ScrollView, Pressable, Text, View } from 'react-native';
import Animated, { useSharedValue, withTiming, Easing, useAnimatedStyle } from 'react-native-reanimated';
import { GlassCard } from '@/components/GlassCard';

interface LyricLine {
  time: number; // seconds
  text: string;
}

interface LyricsPanelProps {
  lyrics: string;
  currentTime: number; // seconds
  duration: number; // seconds
  onSeek?: (time: number) => void;
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

export function LyricsPanel({ lyrics, currentTime, duration, onSeek }: LyricsPanelProps) {
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<ScrollView>(null);
  const lineRefs = useRef(new Map<number, View>());

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
      if (!userScrolling && idx >= 0) {
        const lineView = lineRefs.current.get(idx);
        if (lineView) {
          // @ts-ignore - measure is available on View
          lineView?.measure?.((_x: number, y: number, _w: number, _h: number, _px: number, py: number) => {
            listRef.current?.scrollTo({ y: Math.max(0, py - 120), animated: true });
          });
        }
      }
    }
  }, [currentTime, lines, activeIndex, userScrolling]);

  const handleScrollBegin = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
  }, []);

  const handleScrollEnd = useCallback(() => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => setUserScrolling(false), 3000);
  }, []);

  const handleLinePress = useCallback(
    (time: number) => {
      onSeek?.(time);
      setUserScrolling(false);
    },
    [onSeek]
  );

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
    <ScrollView
      ref={listRef}
      style={{ maxHeight: 300 }}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={handleScrollBegin}
      onMomentumScrollEnd={handleScrollEnd}
      scrollEventThrottle={16}
    >
      <View style={{ paddingVertical: 20 }}>
        {lines.map((line, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;

          return (
            <Pressable
              key={`${i}-${line.time}`}
              ref={(ref) => { if (ref) lineRefs.current.set(i, ref); }}
              onPress={() => handleLinePress(line.time)}
              style={{ paddingVertical: 6, paddingHorizontal: 4 }}
            >
              <AnimatedLine
                text={line.text}
                isActive={isActive}
                isPast={isPast}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
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
