import { useState } from 'react';
import { Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, type TextInputAutoComplete, type TextInputTextContentType } from 'react-native';
import { View, Text } from 'tamagui';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { login as apiLogin } from '@/services/auth';
import { useToast } from '@/components/Toast';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { BG, SURFACE, SURFACE_ICON, ACCENT, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, INPUT_BG, INPUT_BORDER, INPUT_BORDER_FOCUS, BORDER, DANGER, SURFACE_ELEVATED } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, autoComplete, autoFocus, textContentType, icon }: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  autoComplete?: TextInputAutoComplete;
  autoFocus?: boolean;
  textContentType?: TextInputTextContentType;
  icon?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{
        fontSize: 12,
        fontWeight: '600',
        color: TEXT_MUTED,
        marginBottom: 6,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,255,255,0.15)"
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoFocus={Platform.select({ web: autoFocus, default: false })}
        spellCheck={false}
        textContentType={textContentType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          backgroundColor: INPUT_BG,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: focused ? INPUT_BORDER_FOCUS : INPUT_BORDER,
          paddingHorizontal: SPACING.lg,
          paddingVertical: 13,
          fontSize: 15,
          color: TEXT_PRIMARY,
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
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: SPACING.xxl, paddingVertical: SPACING.xxxl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', marginBottom: SPACING.xxl }}>
            <View style={{
              width: 64, height: 64, borderRadius: 18,
              backgroundColor: ACCENT,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: SPACING.lg,
            }}>
              <Text style={{ fontSize: 28, fontWeight: '800', color: 'white', letterSpacing: -1 }}>M</Text>
            </View>
            <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 }}>
              Sign in to Muzix
            </Text>
            <Text style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: SPACING.xs }}>
              Welcome back! Enter your details.
            </Text>
          </View>

          <View style={{
            backgroundColor: SURFACE,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: BORDER,
            padding: SPACING.xl,
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
              textContentType="emailAddress"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              autoComplete="password"
              textContentType="password"
            />

            {error ? (
              <View style={{
                backgroundColor: SURFACE_ELEVATED,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: DANGER,
                paddingHorizontal: SPACING.md,
                paddingVertical: SPACING.sm,
                marginBottom: SPACING.md,
              }}>
                <Text style={{ fontSize: 13, color: DANGER, textAlign: 'center' }}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleLogin}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                backgroundColor: canSubmit ? ACCENT : SURFACE_ICON,
                borderRadius: 10,
                paddingVertical: 13,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy ? 0.7 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
              })}
              accessibilityLabel={busy ? 'Signing in...' : 'Sign In'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
            >
              {busy ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: canSubmit ? 'white' : TEXT_MUTED,
                }}>
                  Sign In
                </Text>
              )}
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xxl, gap: SPACING.lg }}>
            <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
            <Text style={{ fontSize: 13, color: TEXT_MUTED }}>or continue with</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
          </View>

          <View style={{ flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.lg }}>
            <Pressable
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: SURFACE,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: BORDER,
                paddingVertical: 12,
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityLabel="Sign in with Google"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 18 }}>G</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY }}>Google</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => ({
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: SURFACE,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: BORDER,
                paddingVertical: 12,
                opacity: pressed ? 0.7 : 1,
              })}
              accessibilityLabel="Sign in with GitHub"
              accessibilityRole="button"
            >
              <Text style={{ fontSize: 18 }}>⌘</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: TEXT_SECONDARY }}>GitHub</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.push('/register')}
            style={{ alignItems: 'center', marginTop: SPACING.xxl }}
            accessibilityLabel="Create an account"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, color: TEXT_MUTED }}>
              Don&apos;t have an account?{' '}
              <Text style={{ color: ACCENT, fontWeight: '700' }}>Sign up</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
