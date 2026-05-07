import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { colors, gradientPrimary } from '../../theme';
import type { AuthStackParamList } from '../../navigation';
import HCaptchaModal from '../../components/HCaptchaModal';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'PhoneLogin'> };

export default function PhoneLoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState('+976');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaOpen, setCaptchaOpen] = useState(false);

  async function handleSend() {
    const trimmed = phone.trim();

    // Mongolian numbers are E.164 +9769XXXXXXX or +9768XXXXXXX (8-digit
    // national part). Allow optional separators while typing, then strip
    // them. We require +976 prefix + exactly 8 national digits = 12 chars.
    const compact = trimmed.replace(/[\s\-()]/g, '');
    if (!/^\+976\d{8}$/.test(compact)) {
      setError('Зөв утасны дугаар оруулна уу (+976XXXXXXXX)');
      return;
    }

    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    const compact = phone.trim().replace(/[\s\-()]/g, '');
    setLoading(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      phone: compact,
      options: { captchaToken },
    });
    setLoading(false);
    if (otpError) {
      setError(otpError.message);
      return;
    }
    navigation.navigate('VerifyOtp', { method: 'phone', identifier: compact });
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <View style={s.inner}>
            <View style={s.header}>
              <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
                <Ionicons name="arrow-back" size={20} color={colors.textSec} />
              </Pressable>
              <LinearGradient colors={gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.brandTile}>
                <Text style={s.brandLetter}>M</Text>
              </LinearGradient>
              <View style={{ marginLeft: 10 }}>
                <Text style={s.appName}>MONMAP</Text>
                <Text style={s.pageTitle}>Утсаар нэвтрэх</Text>
              </View>
            </View>

            <Text style={s.hint}>
              Таны утасны дугаар руу нэг удаагийн код илгээнэ.
            </Text>

            <Text style={s.label}>УТАСНЫ ДУГААР</Text>
            <View style={[s.inputWrap, focused && s.inputFocused]}>
              <TextInput
                style={s.input}
                placeholder="+97699000000"
                placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoFocus
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <Pressable onPress={handleSend} disabled={loading}>
              <LinearGradient
                colors={loading ? ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)'] : gradientPrimary}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.primaryBtn}
              >
                <Text style={s.primaryBtnText}>{loading ? 'Түр хүлээнэ үү...' : 'SMS код илгээх'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <HCaptchaModal
        visible={captchaOpen}
        onSolved={onCaptchaSolved}
        onCancel={() => setCaptchaOpen(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  inner: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
  backBtn: { marginRight: 12 },
  brandTile: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  brandLetter: { color: '#fff', fontWeight: '700', fontSize: 14 },
  appName: { color: colors.textMuted, fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
  pageTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },

  hint: { color: colors.textSec, fontSize: 13, lineHeight: 19, marginBottom: 22 },

  label: {
    color: colors.textSec, fontSize: 10.5, fontWeight: '600',
    letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 6,
  },
  inputFocused: { borderColor: colors.primary },
  input: { flex: 1, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13 },
  errorText: { color: colors.danger, fontSize: 12, marginBottom: 10 },

  primaryBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14,
    shadowColor: colors.primary, shadowOpacity: 0.31, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },
});
