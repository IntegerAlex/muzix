import { Link, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SURFACE_ICON, BORDER, TEXT_MUTED, TEXT_SECONDARY, TEXT_PRIMARY } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.xxl }}>
          <Text style={{ fontSize: 48, fontWeight: '600', color: TEXT_MUTED }}>404</Text>
          <Text style={{ marginTop: SPACING.xs, textAlign: 'center', fontSize: 14, color: TEXT_SECONDARY }}>
            Page not found
          </Text>
          <Link href="/" asChild>
            <Pressable style={{ marginTop: SPACING.xxl, backgroundColor: SURFACE_ICON, paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.md, borderWidth: 1, borderColor: BORDER, borderRadius: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '500', color: TEXT_PRIMARY }}>Go to Home</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </>
  );
}
