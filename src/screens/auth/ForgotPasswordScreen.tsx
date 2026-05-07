import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { colors, gradientPrimary } from '../../theme';
import type { AuthStackParamList } from '../../navigation';
import HCaptchaModal from '../../components/HCaptchaModal';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'> };

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [error, setError] = useState('');
  const [captchaOpen, setCaptchaOpen] = useState(false);

  async function handleSend() {
    if (!email) { setError('Имэйл хаягаа оруулна уу'); return; }
    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    setLoading(true);
    const trimmed = email.trim();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      trimmed,
      { captchaToken },
    );
    setLoading(false);
    if (authError) { setError(authError.message); return; }
    setSentEmail(trimmed);
    setSent(true);
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          <Text style={s.backText}>Буцах</Text>
        </Pressable>

        {sent
          ? <SentState sentEmail={sentEmail} onResend={() => { setSent(false); setEmail(''); setSentEmail(''); }} onBack={() => navigation.goBack()} />
          : <InputState email={email} setEmail={setEmail} emailFocused={emailFocused} setEmailFocused={setEmailFocused} loading={loading} error={error} onSend={handleSend} />}
      </SafeAreaView>
      <HCaptchaModal
        visible={captchaOpen}
        onSolved={onCaptchaSolved}
        onCancel={() => setCaptchaOpen(false)}
      />
    </View>
  );
}

function InputState({ email, setEmail, emailFocused, setEmailFocused, loading, error, onSend }: {
  email: string; setEmail: (v: string) => void;
  emailFocused: boolean; setEmailFocused: (v: boolean) => void;
  loading: boolean; error: string; onSend: () => void;
}) {
  return (
    <View style={s.center}>
      <View style={s.iconBox}>
        <Ionicons name="mail-outline" size={30} color={colors.primary} />
      </View>
      <Text style={s.title}>Нууц үг сэргээх</Text>
      <Text style={s.subtitle}>
        Бүртгэлтэй имэйл хаягаа оруулна уу.{'\n'}Нууц үг сэргээх холбоос илгээнэ.
      </Text>

      <Text style={s.label}>ИМЭЙЛ ХАЯГ</Text>
      <View style={[s.inputWrap, emailFocused && s.inputFocused]}>
        <TextInput
          style={s.input}
          placeholder="та@example.com"
          placeholderTextColor={colors.textMuted}
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
        />
      </View>
      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <Pressable onPress={onSend} disabled={loading} style={s.btnWrap}>
        <LinearGradient
          colors={!loading ? gradientPrimary : ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={s.primaryBtn}
        >
          <Text style={s.primaryBtnText}>{loading ? 'Илгээж байна...' : 'Холбоос илгээх'}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function SentState({ sentEmail, onResend, onBack }: { sentEmail: string; onResend: () => void; onBack: () => void }) {
  return (
    <View style={s.center}>
      <View style={[s.iconBox, s.iconBoxSuccess]}>
        <Ionicons name="checkmark" size={30} color={colors.success} />
      </View>
      <Text style={s.title}>Имэйл илгээгдлээ!</Text>
      <Text style={s.subtitle}>
        <Text style={{ color: colors.text, fontWeight: '600' }}>{sentEmail}</Text>
        {' '}руу нууц үг сэргээх холбоос илгээгдлээ.
      </Text>
      <Text style={[s.subtitle, { fontSize: 11.5, color: colors.textMuted, marginTop: 4 }]}>
        Спам хавтсаа шалгаарай. Холбоос 24 цагийн дотор хүчинтэй.
      </Text>

      <Pressable onPress={onResend} style={s.btnWrap}>
        <LinearGradient colors={gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.primaryBtn}>
          <Text style={s.primaryBtnText}>Дахин илгээх</Text>
        </LinearGradient>
      </Pressable>
      <Pressable onPress={onBack} style={[s.secondaryBtn, { marginTop: 10 }]}>
        <Text style={s.secondaryBtnText}>Нэвтрэх хуудас руу буцах</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 6 },
  backText: { color: colors.textSec, fontSize: 13, fontWeight: '500' },
  center: { flex: 1, paddingHorizontal: 22, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },

  iconBox: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: 'rgba(0,83,163,0.15)',
    borderWidth: 1, borderColor: 'rgba(0,83,163,0.22)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  iconBoxSuccess: { backgroundColor: 'rgba(16,185,129,0.13)', borderColor: 'rgba(16,185,129,0.27)' },

  title: { color: colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.6, marginBottom: 10 },
  subtitle: { color: colors.textSec, fontSize: 13, lineHeight: 21, textAlign: 'center', marginBottom: 28 },

  label: {
    color: colors.textSec, fontSize: 10.5, fontWeight: '600',
    letterSpacing: 1.2, marginBottom: 8, alignSelf: 'flex-start', textTransform: 'uppercase',
  },
  inputWrap: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  inputFocused: { borderColor: colors.primary },
  input: { flex: 1, color: colors.text, fontSize: 14, paddingHorizontal: 14, paddingVertical: 13 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 6, alignSelf: 'flex-start' },

  btnWrap: { marginTop: 18, width: '100%' },
  primaryBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },
  secondaryBtn: {
    width: '100%', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
});
