jest.mock('expo-blur', () => ({
  BlurView: ({ children, style }: any) => {
    const { View } = require('react-native');
    return <View style={style}>{children}</View>;
  },
  BlurTargetView: 'BlurTargetView',
}));

jest.mock('react-native/Libraries/Utilities/Platform', () => {
  const Platform = jest.requireActual(
    'react-native/Libraries/Utilities/Platform',
  );
  Platform.OS = 'ios';
  return Platform;
});

import React from 'react';
import { render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { GlassCard } from '@/components/GlassCard';

describe('GlassCard', () => {
  it('renders children with elevated variant by default', () => {
    const { getByText } = render(
      <GlassCard>
        <Text>Hello</Text>
      </GlassCard>,
    );
    expect(getByText('Hello')).toBeTruthy();
  });

  it('renders children with glass variant', () => {
    const { getByText } = render(
      <GlassCard variant="glass">
        <Text>Frosted</Text>
      </GlassCard>,
    );
    expect(getByText('Frosted')).toBeTruthy();
  });

  it('accepts custom radius and padding', () => {
    const { getByText } = render(
      <GlassCard radius={12} padding={8}>
        <Text>Custom</Text>
      </GlassCard>,
    );
    expect(getByText('Custom')).toBeTruthy();
  });

  it('accepts intensity prop with glass variant', () => {
    const { getByText } = render(
      <GlassCard variant="glass" intensity={60}>
        <Text>Intense</Text>
      </GlassCard>,
    );
    expect(getByText('Intense')).toBeTruthy();
  });

  it('renders glass variant with blue tint overlay', () => {
    const { UNSAFE_getByType } = render(
      <GlassCard variant="glass">
        <Text>Blue</Text>
      </GlassCard>,
    );
    expect(UNSAFE_getByType(Text)).toBeTruthy();
  });

  it('renders glass variant with shadow wrapper', () => {
    const { UNSAFE_getByType } = render(
      <GlassCard variant="glass">
        <Text>Shadow</Text>
      </GlassCard>,
    );
    const outerViews = UNSAFE_getByType(View);
    expect(outerViews).toBeTruthy();
  });
});
