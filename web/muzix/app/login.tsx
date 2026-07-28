import { useState } from 'react';
import { Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { View, Text } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuthStore, login as apiLogin } from '@/store/authStore';
import { useToast } from '@/components/Toast';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { BG, ACCENT, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, INPUT_BG, INPUT_BORDER, INPUT_BORDER_FOCUS } from '@/lib/colors';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  autoComplete?: string;
  autoFocus?: boolean;
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, autoComplete, autoFocus }: FieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{
        fontSize: 13,
        fontWeight: '500',
        color: focused ? ACCENT : TEXT_MUTED,
        marginBottom: 8,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
      }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.2)"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete as any}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          backgroundColor: INPUT_BG,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: focused ? INPUT_BORDER_FOCUS : INPUT_BORDER,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 16,
          color: TEXT_PRIMARY,
          letterSpacing: 0.2,
        }}
      />
    </View>
  );
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const { toast } = useToast();

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const { token, user } = await apiLogin(email, password);
      setAuth(token, user);
      router.replace('/');
    } catch (e) {
      const msg = e?.message ?? 'Login failed';
      setError(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <AnimatedBackdrop />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo + Heading */}
          <View style={{ alignItems: 'center', marginBottom: 48 }}>
            <LinearGradient
              colors={[ACCENT, '#134E3A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 72, height: 72, borderRadius: 20,
                alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 20px rgba(29,185,84,0.35)',
                elevation: 10,
              }}
            >
              <Text style={{ fontSize: 32, fontWeight: '700', color: 'white', letterSpacing: -1 }}>M</Text>
            </LinearGradient>
            <Text style={{ fontSize: 28, fontWeight: '700', color: TEXT_PRIMARY, marginTop: 28, letterSpacing: -0.5 }}>
              Welcome back
            </Text>
            <Text style={{ fontSize: 15, color: TEXT_SECONDARY, marginTop: 6 }}>
              Sign in to continue listening
            </Text>
          </View>

          {/* Form */}
          <View style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.06)',
            padding: 24,
          }}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              autoComplete="password"
            />

            {/* Error */}
            {error ? (
              <View style={{
                backgroundColor: 'rgba(244,63,94,0.1)',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: 'rgba(244,63,94,0.2)',
                paddingHorizontal: 14, paddingVertical: 10,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 13, color: '#f43f5e', textAlign: 'center' }}>{error}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <Pressable
              onPress={handleLogin}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                backgroundColor: canSubmit ? ACCENT : 'rgba(29,185,84,0.3)',
                borderRadius: 12,
                paddingVertical: 15,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
              accessibilityLabel={busy ? 'Signing in...' : 'Sign In'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: '700',
                color: canSubmit ? 'white' : 'rgba(255,255,255,0.4)',
                letterSpacing: 0.3,
              }}>
                {busy ? 'Signing in...' : 'Sign In'}
              </Text>
            </Pressable>
          </View>

          {/* Footer link */}
          <Pressable
            onPress={() => router.push('/register')}
            style={{ alignItems: 'center', marginTop: 24 }}
            accessibilityLabel="Create an account"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, color: TEXT_MUTED }}>
              Don't have an account?{' '}
              <Text style={{ color: ACCENT, fontWeight: '700' }}>Create one</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
