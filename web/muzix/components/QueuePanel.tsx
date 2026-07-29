import { useEffect, useCallback } from 'react';
import { Pressable, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import Animated, { useSharedValue, withSpring, useAnimatedStyle, runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, ChevronUp, ChevronDown, ListMusic, Trash2 } from 'lucide-react-native';
import { View, Text } from 'tamagui';
import { Artwork } from '@/components/Artwork';
import { usePlayerStore } from '@/store/playerStore';
import { SURFACE_ELEVATED, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, ACCENT, BORDER, DANGER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

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

  const handleMoveUp = useCallback(
    (index: number) => {
      if (index > 0) reorderQueue(index, index - 1);
    },
    [reorderQueue]
  );

  const handleMoveDown = useCallback(
    (index: number) => {
      if (index < queue.length - 1) reorderQueue(index, index + 1);
    },
    [reorderQueue, queue.length]
  );

  const handleRemove = useCallback(
    (index: number) => {
      removeFromQueue(index);
    },
    [removeFromQueue]
  );

  const handlePlay = useCallback(
    (index: number) => {
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
          <Text fontSize={12} color={TEXT_MUTED} style={{ marginTop: 2 }}>{queue.length} {queue.length === 1 ? 'song' : 'songs'}</Text>
        </View>

        {queue.length === 0 ? (
          <EmptyQueue />
        ) : (
          <>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {queue.map((song, index) => {
                const isCurrent = index === currentIndex;
                return (
                  <View
                    key={`${song.id}-${index}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SPACING.sm,
                      paddingHorizontal: SPACING.lg,
                      paddingVertical: SPACING.sm,
                      backgroundColor: isCurrent ? 'rgba(29,185,84,0.08)' : 'transparent',
                    }}
                  >
                    <View style={{ flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                      <Pressable
                        onPress={() => handleMoveUp(index)}
                        disabled={index === 0}
                        hitSlop={4}
                        accessibilityLabel="Move up"
                        accessibilityRole="button"
                        style={{ opacity: index === 0 ? 0.2 : 1 }}
                      >
                        <ChevronUp size={14} color={TEXT_SECONDARY} />
                      </Pressable>
                      <Pressable
                        onPress={() => handleMoveDown(index)}
                        disabled={index === queue.length - 1}
                        hitSlop={4}
                        accessibilityLabel="Move down"
                        accessibilityRole="button"
                        style={{ opacity: index === queue.length - 1 ? 0.2 : 1 }}
                      >
                        <ChevronDown size={14} color={TEXT_SECONDARY} />
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => handlePlay(index)}
                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.sm }}
                      accessibilityLabel={`${song.title} by ${song.artist}`}
                      accessibilityRole="button"
                    >
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
                      onPress={() => handleRemove(index)}
                      hitSlop={8}
                      accessibilityLabel="Remove from queue"
                      accessibilityRole="button"
                      style={{ padding: 4 }}
                    >
                      <X size={18} color={TEXT_MUTED} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>

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
