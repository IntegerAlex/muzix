import { useState } from 'react';
import { Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { View, Text } from 'tamagui';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuthStore, register as apiRegister } from '@/store/authStore';
import { useToast } from '@/components/Toast';
import { AnimatedBackdrop } from '@/components/AnimatedBackdrop';
import { BG, ACCENT, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_MUTED, INPUT_BG, INPUT_BORDER, INPUT_BORDER_FOCUS, DANGER } from '@/lib/colors';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'email-address' | 'default';
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  autoFocus?: boolean;
  error?: string;
}

function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, autoCapitalize, autoFocus, error }: FieldProps) {
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
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          backgroundColor: INPUT_BG,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? 'rgba(244,63,94,0.5)' : focused ? INPUT_BORDER_FOCUS : INPUT_BORDER,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 16,
          color: TEXT_PRIMARY,
          letterSpacing: 0.2,
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
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo + Heading */}
          <View style={{ alignItems: 'center', marginBottom: 40 }}>
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
              Create your account
            </Text>
            <Text style={{ fontSize: 15, color: TEXT_SECONDARY, marginTop: 6 }}>
              Join Muzix and start listening
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
              label="Display Name"
              value={displayName}
              onChangeText={(t) => { setDisplayName(t); setErrors((p) => ({ ...p, displayName: '' })); setServerError(null); }}
              placeholder="Your name"
              autoCapitalize="words"
              autoFocus
              error={errors.displayName}
            />
            <Field
              label="Email"
              value={email}
              onChangeText={(t) => { setEmail(t); setErrors((p) => ({ ...p, email: '' })); setServerError(null); }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={(t) => { setPassword(t); setErrors((p) => ({ ...p, password: '', confirm: '' })); setServerError(null); }}
              placeholder="At least 6 characters"
              secureTextEntry
              error={errors.password}
            />
            <Field
              label="Confirm Password"
              value={confirm}
              onChangeText={(t) => { setConfirm(t); setErrors((p) => ({ ...p, confirm: '' })); setServerError(null); }}
              placeholder="Repeat your password"
              secureTextEntry
              error={errors.confirm}
            />

            {serverError ? (
              <View style={{
                backgroundColor: 'rgba(244,63,94,0.1)',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: 'rgba(244,63,94,0.2)',
                paddingHorizontal: 14, paddingVertical: 10,
                marginBottom: 16,
              }}>
                <Text style={{ fontSize: 13, color: '#f43f5e', textAlign: 'center' }}>{serverError}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <Pressable
              onPress={handleRegister}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                backgroundColor: canSubmit ? ACCENT : 'rgba(29,185,84,0.3)',
                borderRadius: 12,
                paddingVertical: 15,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
                transform: [{ scale: pressed ? 0.98 : 1 }],
                marginTop: 8,
              })}
              accessibilityLabel={busy ? 'Creating account...' : 'Create Account'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
            >
              <Text style={{
                fontSize: 16,
                fontWeight: '700',
                color: canSubmit ? 'white' : 'rgba(255,255,255,0.4)',
                letterSpacing: 0.3,
              }}>
                {busy ? 'Creating account...' : 'Create Account'}
              </Text>
            </Pressable>
          </View>

          {/* Footer link */}
          <Pressable
            onPress={() => router.push('/login')}
            style={{ alignItems: 'center', marginTop: 24, marginBottom: 20 }}
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
