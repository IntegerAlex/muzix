import { Link, Stack } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 48, fontWeight: '600', color: 'rgba(255,255,255,0.3)' }}>404</Text>
          <Text style={{ marginTop: 4, textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
            Page not found
          </Text>
          <Link href="/" asChild>
            <Pressable style={{ marginTop: 24, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 24, paddingVertical: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '500', color: 'white' }}>Go to Home</Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </>
  );
}
