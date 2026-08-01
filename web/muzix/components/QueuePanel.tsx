import { useEffect, useCallback } from 'react';
import { Pressable, useWindowDimensions, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import type { RenderItem } from 'react-native-draggable-flatlist';
import { X, ListMusic, Trash2 } from '@/lib/icons';
import { View, Text } from 'tamagui';
import { Artwork } from '@/components/Artwork';
import { usePlayerStore } from '@/store/playerStore';
import { useHaptics } from '@/hooks/useHaptics';
import { SURFACE_ELEVATED, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER, DANGER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import type { QueueItem } from '@/services/types';

function EmptyQueue() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 }}>
      <ListMusic size={48} color={TEXT_MUTED} />
      <Text fontSize={16} fontWeight="600" color={TEXT_SECONDARY}>Queue is empty</Text>
      <Text fontSize={13} color={TEXT_MUTED} style={{ textAlign: 'center', paddingHorizontal: 32 }}>
        Add songs to your queue to see them here
      </Text>
    </View>
  );
}

function GripHandle() {
  return (
    <View style={{ flexDirection: 'row', gap: 3, padding: 6 }}>
      {[0, 1, 2].map((col) => (
        <View key={col} style={{ gap: 3 }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: TEXT_MUTED }} />
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: TEXT_MUTED }} />
        </View>
      ))}
    </View>
  );
}

interface QueuePanelProps {
  onClose: () => void;
}

export function QueuePanel({ onClose }: QueuePanelProps) {
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queue = usePlayerStore((s) => s.queue);
  const currentIndex = usePlayerStore((s) => s.currentIndex);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const reorderQueue = usePlayerStore((s) => s.reorderQueue);
  const playSong = usePlayerStore((s) => s.playSong);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const { impact } = useHaptics();

  const translateY = useSharedValue(screenHeight);

  useEffect(() => {
    translateY.value = withSpring(0, { damping: 20, stiffness: 200, mass: 0.8 });
  }, [translateY]);

  const handleClose = useCallback(() => {
    translateY.value = withSpring(screenHeight, { damping: 20, stiffness: 200, mass: 0.8 }, () => {
      runOnJS(onClose)();
    });
  }, [translateY, onClose, screenHeight]);

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const handleRemove = useCallback(
    (queueItemId: string) => {
      removeFromQueue(queueItemId);
    },
    [removeFromQueue]
  );

  const handlePlay = useCallback(
    (queueItemId: string) => {
      const index = queue.findIndex((s) => s.queueItemId === queueItemId);
      if (index < 0) return;
      const song = queue[index];
      if (song) {
        playSong(song, queue, index);
      }
    },
    [queue, playSong]
  );

  const handleClearAll = useCallback(() => {
    clearQueue();
  }, [clearQueue]);

  const handleDragEnd = useCallback(
    ({ from, to }: { from: number; to: number }) => {
      impact('medium');
      if (from !== to) {
        reorderQueue(from, to);
      }
    },
    [impact, reorderQueue]
  );

  const renderItem = useCallback<RenderItem<QueueItem>>(
    ({ item: song, getIndex, drag, isActive }) => {
      const index = getIndex() ?? 0;
      const isCurrent = index === currentIndex;
      return (
        <ScaleDecorator activeScale={1.02}>
          <View
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACING.sm,
                paddingHorizontal: SPACING.lg,
                paddingVertical: SPACING.sm,
                backgroundColor: isCurrent ? 'rgba(29,185,84,0.08)' : 'transparent',
                borderRadius: 12,
              },
              isActive && {
                backgroundColor: SURFACE_ELEVATED,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 16,
                elevation: 12,
              },
            ]}
          >
            <Pressable
              onPress={() => handlePlay(song.queueItemId)}
              onLongPress={drag}
              disabled={isActive}
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.sm }}
              accessibilityLabel={`${song.title} by ${song.artist}`}
              accessibilityRole="button"
            >
              <GripHandle />
              <Artwork
                source={song.imageUrl ? { uri: song.imageUrl } : undefined}
                colors={song.colors}
                style={{ height: 48, width: 48, borderRadius: 8 }}
                radius={8}
              />
              <View style={{ flex: 1 }}>
                <Text
                  fontSize={14}
                  fontWeight="600"
                  color={isCurrent ? ACCENT : TEXT_PRIMARY}
                  numberOfLines={1}
                >
                  {song.title}
                </Text>
                <Text fontSize={12} color={TEXT_SECONDARY} numberOfLines={1}>
                  {song.artist}
                </Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => handleRemove(song.queueItemId)}
              hitSlop={8}
              accessibilityLabel="Remove from queue"
              accessibilityRole="button"
              style={{ padding: 4 }}
            >
              <X size={18} color={TEXT_MUTED} />
            </Pressable>
          </View>
        </ScaleDecorator>
      );
    },
    [currentIndex, handlePlay, handleRemove]
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        onPress={handleClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
        accessibilityLabel="Close queue"
        accessibilityRole="button"
      />
      <Animated.View
        style={[
          panelStyle,
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: '70%',
            backgroundColor: SURFACE_ELEVATED,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: SPACING.lg,
            paddingBottom: insets.bottom + SPACING.md,
          },
        ]}
      >
        <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text fontSize={18} fontWeight="700" color={TEXT_PRIMARY}>Queue</Text>
            <Pressable onPress={handleClose} hitSlop={8} accessibilityLabel="Close" accessibilityRole="button">
              <X size={22} color={TEXT_PRIMARY} />
            </Pressable>
          </View>
          <Text fontSize={12} color={TEXT_MUTED} style={{ marginTop: 2 }}>
            {queue.length} {queue.length === 1 ? 'song' : 'songs'} · hold & drag to reorder
          </Text>
        </View>

        {queue.length === 0 ? (
          <EmptyQueue />
        ) : (
          <>
            <DraggableFlatList
              data={queue}
              keyExtractor={(item) => item.queueItemId}
              onDragBegin={() => impact('light')}
              onDragEnd={handleDragEnd}
              renderItem={renderItem}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: SPACING.md }}
              showsVerticalScrollIndicator={false}
              dragItemOverflow={false}
            />

            <Pressable
              onPress={handleClearAll}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: SPACING.sm,
                paddingVertical: SPACING.md,
                marginHorizontal: SPACING.lg,
                marginTop: SPACING.sm,
                borderTopWidth: 1,
                borderTopColor: BORDER,
              }}
              accessibilityLabel="Clear queue"
              accessibilityRole="button"
            >
              <Trash2 size={16} color={DANGER} />
              <Text fontSize={14} fontWeight="600" color={DANGER}>Clear all</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </View>
  );
}
