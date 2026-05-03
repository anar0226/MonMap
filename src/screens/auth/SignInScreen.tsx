import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Screen } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { colors, spacing } from '../../theme';

interface Props {
  onBack: () => void;
  onSignUp: () => void;
}

export function SignInScreen({ onBack, onSignUp }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function handleSignIn() {
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e: any) {
      setError(errorMessage(e?.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen keyboard scroll edges={['top', 'bottom']}>
      <TouchableOpacity onPress={onBack} style={s.back} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={22} color={colors.textSec} />
        <Text style={s.backText}>Буцах</Text>
      </TouchableOpacity>

      <View style={s.header}>
        <Text style={s.title}>Нэвтрэх</Text>
      </View>

      <View style={s.form}>
        <Input
          placeholder="И-мэйл хаяг"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <Input
          ref={passwordRef}
          placeholder="Нууц үг"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPass}
          returnKeyType="done"
          onSubmitEditing={handleSignIn}
          containerStyle={s.passwordInput}
          trailing={
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={s.eyeBtn}>
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          }
        />

        {error && <Text style={s.error}>{error}</Text>}

        <Button
          label="Нэвтрэх"
          onPress={handleSignIn}
          loading={loading}
          disabled={!email.trim() || !password}
          style={s.submitBtn}
        />
      </View>

      <View style={s.footer}>
        <Text style={s.footerText}>Бүртгэл байхгүй юу? </Text>
        <TouchableOpacity onPress={onSignUp}>
          <Text style={s.footerLink}>Бүртгүүлэх</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

function errorMessage(msg?: string): string {
  if (!msg) return 'Алдаа гарлаа';
  if (msg.includes('Invalid login credentials')) return 'И-мэйл эсвэл нууц үг буруу байна';
  if (msg.includes('Email not confirmed')) return 'И-мэйл хаягаа баталгаажуулна уу';
  if (msg.includes('Too many requests')) return 'Хэт олон оролдлого. Түр хүлээнэ үү';
  return 'Нэвтрэхэд алдаа гарлаа';
}

const s = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing['3xl'],
  },
  backText: {
    fontSize: 15,
    color: colors.textSec,
  },
  header: {
    marginBottom: spacing['3xl'],
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  form: {
    gap: spacing.md,
  },
  passwordInput: {
    marginTop: 0,
  },
  eyeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    marginTop: -spacing.xs,
  },
  submitBtn: {
    marginTop: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['2xl'],
  },
  footerText: {
    fontSize: 14,
    color: colors.textSec,
  },
  footerLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
