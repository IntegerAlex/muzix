import { Tabs, usePathname, useRouter } from 'expo-router';
import { House, Search, Library, User } from '@/lib/icons';
import { View, Pressable } from 'react-native';
import { BG, SURFACE, SURFACE_ICON, TEXT_MUTED, BORDER, ACCENT } from '@/lib/colors';
import { useResponsive } from '@/lib/useResponsive';

const TABS = [
  { name: 'index', title: 'Home', icon: House },
  { name: 'search', title: 'Search', icon: Search },
  { name: 'library', title: 'Library', icon: Library },
  { name: 'profile', title: 'Profile', icon: User },
] as const;

export default function TabsLayout() {
  const { orientation, isDesktop, isTablet } = useResponsive();
  const isWide = isDesktop || (isTablet && orientation === 'landscape');
  const pathname = usePathname();
  const router = useRouter();

  if (isWide) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: BG }}>
        <View
          style={{
            width: 72,
            backgroundColor: SURFACE,
            borderRightWidth: 1,
            borderRightColor: BORDER,
            paddingTop: 60,
            alignItems: 'center',
            gap: 8,
          }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.name === 'index'
              ? pathname === '/'
              : pathname === `/${tab.name}` || pathname.startsWith(`/${tab.name}/`);
            return (
              <Pressable
                key={tab.name}
                onPress={() => router.push(tab.name === 'index' ? '/' : `/${tab.name}`)}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  backgroundColor: isActive ? SURFACE_ICON : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  size={22}
                  color={isActive ? ACCENT : TEXT_MUTED}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </Pressable>
            );
          })}
        </View>
        <View style={{ flex: 1 }}>
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
          >
            <Tabs.Screen name="index" />
            <Tabs.Screen name="search" />
            <Tabs.Screen name="library" />
            <Tabs.Screen name="profile" />
            <Tabs.Screen name="album/[id]" options={{ href: null }} />
            <Tabs.Screen name="artist/[id]" options={{ href: null }} />
            <Tabs.Screen name="playlist/[id]" options={{ href: null }} />
          </Tabs>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: BG,
          borderTopColor: BORDER,
          borderTopWidth: 0.5,
          elevation: 0,
          shadowOpacity: 0,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: TEXT_MUTED,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          marginBottom: 6,
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
