import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Music, ListMusic, WifiOff } from '@/lib/icons';
import { TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

interface EmptyStateProps {
  icon?: React.ReactNode;
  heading: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ icon, heading, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon && <View style={styles.icon}>{icon}</View>}
      <Text style={styles.heading}>{heading}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.button} onPress={onAction} accessibilityRole="button">
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyLibrary(props: Partial<EmptyStateProps>) {
  return (
    <EmptyState
      icon={<Music size={48} color={TEXT_MUTED} />}
      heading="Your library is empty"
      description="Songs you add will appear here"
      {...props}
    />
  );
}

export function EmptyQueue(props: Partial<EmptyStateProps>) {
  return (
    <EmptyState
      icon={<ListMusic size={48} color={TEXT_MUTED} />}
      heading="Queue is empty"
      description="Add songs to start listening"
      actionLabel="Browse songs"
      {...props}
    />
  );
}

export function NoNetwork(props: Partial<EmptyStateProps>) {
  return (
    <EmptyState
      icon={<WifiOff size={48} color={TEXT_MUTED} />}
      heading="No connection"
      description="Check your internet connection and try again"
      actionLabel="Retry"
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: SPACING.xxxl,
  },
  icon: {
    marginBottom: 16,
    opacity: 0.5,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  button: {
    backgroundColor: ACCENT,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 14,
  },
});
