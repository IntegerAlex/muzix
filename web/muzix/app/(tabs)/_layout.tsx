import { Tabs } from 'expo-router';
import { House, Search, Library, User } from 'lucide-react-native';
import { TEXT_MUTED, BORDER, ACCENT } from '@/lib/colors';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(11,16,32,0.85)',
          borderTopColor: BORDER,
          borderTopWidth: 0.5,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: TEXT_MUTED,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginBottom: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <House size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ color, size }) => <Library size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen name="album/[id]" options={{ href: null }} />
      <Tabs.Screen name="artist/[id]" options={{ href: null }} />
      <Tabs.Screen name="playlist/[id]" options={{ href: null }} />
    </Tabs>
  );
}
