import { useState } from 'react';
import { Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, type TextInputAutoComplete, type TextInputTextContentType, Image } from 'react-native';
import { View, Text } from 'tamagui';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { register as apiRegister } from '@/services/auth';
import { useToast } from '@/components/Toast';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { BG, SURFACE, SURFACE_ELEVATED, SURFACE_ICON, ACCENT, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, INPUT_BG, INPUT_BORDER, INPUT_BORDER_FOCUS, BORDER, DANGER } from '@/lib/colors';
import { SPACING } from '@/lib/spacing';
import { RADIUS } from '@/lib/sizing';

interface FieldProps {
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
  error?: string;
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, autoFocus, error }: FieldProps) {
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
          borderColor: error ? DANGER : focused ? INPUT_BORDER_FOCUS : INPUT_BORDER,
          paddingHorizontal: SPACING.lg,
          paddingVertical: 13,
          fontSize: 15,
          color: TEXT_PRIMARY,
        }}
      />
      {error ? (
        <Text style={{ fontSize: 12, color: DANGER, marginTop: 6, marginLeft: 4 }}>{error}</Text>
      ) : null}
    </View>
  );
}

export default function RegisterScreen() {
   const [displayName, setDisplayName] = useState('');
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [confirm, setConfirm] = useState('');
   const [busy, setBusy] = useState(false);
   const [errors, setErrors] = useState<Record<string, string>>({});
   const [serverError, setServerError] = useState<string | null>(null);
   const setAuth = useAuthStore((s) => s.setAuth);
   const { toast } = useToast();

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!displayName.trim()) e.displayName = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email address';
    if (!password) e.password = 'Password is required';
    else if (password.length < 6) e.password = 'At least 6 characters';
    if (password !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const canSubmit = !busy && displayName.trim().length > 0 && email.trim().length > 0 && password.length > 0 && confirm.length > 0;

  const handleRegister = async () => {
    if (!validate()) return;
    setBusy(true);
    setServerError(null);
    try {
      const { token, user } = await apiRegister(email, password, displayName);
      setAuth(token, user);
      router.replace('/');
    } catch (e) {
      const msg = e?.message ?? 'Registration failed';
      if (msg.toLowerCase().includes('email') && msg.toLowerCase().includes('regist')) {
        setErrors((p) => ({ ...p, email: msg }));
      } else if (msg.toLowerCase().includes('display') || msg.toLowerCase().includes('name')) {
        setErrors((p) => ({ ...p, displayName: msg }));
      } else if (msg.toLowerCase().includes('password')) {
        setErrors((p) => ({ ...p, password: msg }));
      } else {
        setServerError(msg);
      }
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
            <Image
              source={require('@/assets/images/logo.png')}
              style={{ width: 64, height: 64, borderRadius: 18, marginBottom: SPACING.lg }}
              contentFit="contain"
            />
            <Text style={{ fontSize: 24, fontWeight: '700', color: TEXT_PRIMARY, letterSpacing: -0.3 }}>
              Create your account
            </Text>
            <Text style={{ fontSize: 14, color: TEXT_SECONDARY, marginTop: SPACING.xs }}>
              Join Muzix and start listening
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
              label="Display Name"
              value={displayName}
              onChangeText={(t) => { setDisplayName(t); setErrors((p) => ({ ...p, displayName: '' })); setServerError(null); }}
              placeholder="Your name"
              autoCapitalize="words"
              autoComplete="name"
              autoFocus
              textContentType="name"
              error={errors.displayName}
            />
            <Field
              label="Email"
              value={email}
              onChangeText={(t) => { setEmail(t); setErrors((p) => ({ ...p, email: '' })); setServerError(null); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              error={errors.email}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); setErrors((p) => ({ ...p, password: '', confirm: '' })); setServerError(null); }}
              placeholder="At least 6 characters"
              secureTextEntry
              autoComplete="newPassword"
              textContentType="newPassword"
              error={errors.password}
            />
            <Field
              label="Confirm Password"
              value={confirm}
              onChangeText={(t) => { setConfirm(t); setErrors((p) => ({ ...p, confirm: '' })); setServerError(null); }}
              placeholder="Repeat your password"
              secureTextEntry
              autoComplete="newPassword"
              textContentType="newPassword"
              error={errors.confirm}
            />

            {serverError ? (
              <View style={{
                backgroundColor: SURFACE_ELEVATED,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: DANGER,
                paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
                marginBottom: SPACING.md,
              }}>
                <Text style={{ fontSize: 13, color: DANGER, textAlign: 'center' }}>{serverError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleRegister}
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
              accessibilityLabel={busy ? 'Creating account...' : 'Create Account'}
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
                  Create Account
                </Text>
              )}
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.push('/login')}
            style={{ alignItems: 'center', marginTop: SPACING.xxl }}
            accessibilityLabel="Sign in to existing account"
            accessibilityRole="button"
          >
            <Text style={{ fontSize: 14, color: TEXT_MUTED }}>
              Already have an account?{' '}
              <Text style={{ color: ACCENT, fontWeight: '700' }}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
