import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import { View, Text, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';

interface Toast {
  id: number;
  message: string;
  type: 'error' | 'success' | 'info';
}

interface ToastContextValue {
  toast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let _nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast['type'] = 'error') => {
    const id = _nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <View style={{ position: 'absolute', top: 60, left: 16, right: 16, zIndex: 9999, pointerEvents: 'box-none' }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const COLORS = {
  error: { bg: '#dc2626', border: '#f87171' },
  success: { bg: '#16a34a', border: '#4ade80' },
  info: { bg: '#2563eb', border: '#60a5fa' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-20);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.ease) });
    translateY.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.ease) });
  }, [opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const colors = COLORS[toast.type];

  return (
    <Animated.View style={[style, { marginBottom: 8 }]}>
      <View
        style={{
          backgroundColor: colors.bg,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          ...(Platform.OS === 'web'
            ? { boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }
            : { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 }),
        }}
      >
        <Text style={{ color: 'white', fontSize: 14, fontWeight: '500', flex: 1 }} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}
