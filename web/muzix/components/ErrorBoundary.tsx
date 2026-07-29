import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Pressable } from 'react-native';
import { View, Text } from 'tamagui';
import { BG, TEXT_PRIMARY, TEXT_SECONDARY, ACCENT, DANGER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (props: { error: Error; resetError: () => void }) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error!,
          resetError: this.resetError,
        });
      }

      return (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            flex: 1,
            backgroundColor: BG,
            justifyContent: 'center',
            alignItems: 'center',
            padding: SPACING.xxxl,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: DANGER,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: SPACING.lg,
            }}
          >
            <Text style={{ fontSize: 24, color: 'white', fontWeight: '700' }}>!</Text>
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: TEXT_PRIMARY,
              marginBottom: SPACING.sm,
              textAlign: 'center',
            }}
          >
            Something went wrong
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              textAlign: 'center',
              marginBottom: SPACING.xxl,
              lineHeight: 20,
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred'}
          </Text>
          <Pressable
            onPress={this.resetError}
            style={({ pressed }) => ({
              backgroundColor: ACCENT,
              paddingHorizontal: 24,
              paddingVertical: 12,
              borderRadius: 10,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>
              Try Again
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}
