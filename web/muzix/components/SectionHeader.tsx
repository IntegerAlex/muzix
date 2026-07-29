import { Link, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { styled, Text, XStack, View } from 'tamagui';
import { SPACING } from '@/lib/spacing';
import { TEXT_PRIMARY, TEXT_SECONDARY } from '@/lib/colors';

const HeaderRow = styled(XStack, {
  mb: SPACING.md,
  mt: SPACING.xxxl,
  px: SPACING.xl,
});

const Title = styled(Text, {
  color: TEXT_PRIMARY,
  fontSize: 20,
  fontWeight: '700',
});

const Action = styled(Text, {
  color: TEXT_SECONDARY,
  fontSize: 14,
  fontWeight: '500',
});

interface SectionHeaderProps {
  title: string;
  href?: string;
  count?: number;
}

export function SectionHeader({ title, href }: SectionHeaderProps) {
  return (
    <HeaderRow style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Title>{title}</Title>
      {href ? (
        <Link href={href as Href} asChild>
          <Pressable accessibilityRole="link">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Action>See All</Action>
              <ChevronRight size={16} color={TEXT_SECONDARY} />
            </View>
          </Pressable>
        </Link>
      ) : null}
    </HeaderRow>
  );
}
