import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '../../lib/supabase';
import { colors, gradientPrimary } from '../../theme';
import type { AuthStackParamList } from '../../navigation';
import HCaptchaModal from '../../components/HCaptchaModal';

WebBrowser.maybeCompleteAuthSession();

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaOpen, setCaptchaOpen] = useState(false);

  async function handleFacebookLogin() {
    setLoading(true);
    setError('');
    const redirectUri = makeRedirectUri();
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: redirectUri, skipBrowserRedirect: true },
    });
    if (oauthError || !data.url) {
      setError('Фэйсбүүкээр нэвтрэхэд алдаа гарлаа');
      setLoading(false);
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
    if (result.type === 'success') {
      const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
      if (sessionError) setError('Нэвтрэхэд алдаа гарлаа');
    }
    setLoading(false);
  }

  async function handleLogin() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Имэйл болон нууц үгээ оруулна уу');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Зөв и-мэйл хаяг оруулна уу');
      return;
    }
    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken },
    });
    setLoading(false);
    if (authError) {
      const msg = authError.message;
      if (msg.includes('Invalid login credentials')) setError('Имэйл эсвэл нууц үг буруу байна');
      else setError('Нэвтрэхэд алдаа гарлаа');
    }
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {/* Brand header */}
            <View style={s.header}>
              <LinearGradient colors={gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.brandTile}>
                <Text style={s.brandLetter}>M</Text>
              </LinearGradient>
              <Text style={s.appName}>MONMAP</Text>
              <Text style={s.title}>Тавтай морил</Text>
              <Text style={s.subtitle}>Та дансандаа нэвтэрнэ үү</Text>
            </View>

            {/* Form */}
            <View style={s.form}>
              <Text style={s.label}>ИМЭЙЛ</Text>
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

              <Text style={[s.label, { marginTop: 14 }]}>НУУЦ ҮГ</Text>
              <View style={[s.inputWrap, passwordFocused && s.inputFocused]}>
                <TextInput
                  style={[s.input, s.inputFlex]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!passwordVisible}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <Pressable onPress={() => setPasswordVisible(v => !v)} style={s.eyeBtn} hitSlop={8}>
                  <Ionicons
                    name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={17}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>

              <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={s.forgotBtn}>
                <Text style={s.forgotText}>Нууц үг мартсан уу?</Text>
              </Pressable>

              {error ? <Text style={s.errorText}>{error}</Text> : null}

              {/* CTA */}
              <Pressable onPress={handleLogin} disabled={loading}>
                <LinearGradient
                  colors={loading ? ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)'] : gradientPrimary}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.primaryBtn}
                >
                  <Text style={s.primaryBtnText}>{loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}</Text>
                </LinearGradient>
              </Pressable>

              <View style={s.signupRow}>
                <Text style={s.signupText}>Шинэ хэрэглэгч болох </Text>
                <Pressable onPress={() => navigation.navigate('SignUp')}>
                  <Text style={s.signupLink}>Бүртгүүлэх</Text>
                </Pressable>
              </View>

              {/* Divider */}
              <View style={s.divider}>
                <View style={s.dividerLine} />
                <Text style={s.dividerText}>эсвэл</Text>
                <View style={s.dividerLine} />
              </View>

              {/* Social auth row */}
              <View style={s.socialRow}>
                <Pressable style={s.socialBtn} onPress={handleFacebookLogin} disabled={loading}>
                  <Ionicons name="logo-facebook" size={18} color="#1877F2" />
                </Pressable>
                <Pressable style={s.socialBtn} onPress={() => navigation.navigate('PhoneLogin')} disabled={loading}>
                  <Ionicons name="call-outline" size={18} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {/* Legal */}
            <Text style={s.legal}>
              Нэвтрэснээр та манай{' '}
              <Text style={s.legalLink}>Үйлчилгээний нөхцөл</Text>
              {' '}болон{' '}
              <Text style={s.legalLink}>Нууцлалын бодлого</Text>
              -той зөвшөөрч байна.
            </Text>
          </ScrollView>
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
  scroll: { paddingHorizontal: 24, paddingTop: 44, paddingBottom: 32 },

  header: { alignItems: 'center', marginBottom: 36 },
  brandTile: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.33, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  brandLetter: { color: '#fff', fontWeight: '700', fontSize: 19, letterSpacing: -0.3 },
  appName: { color: colors.textMuted, fontSize: 10.5, fontWeight: '600', letterSpacing: 2.2, marginTop: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.8, marginTop: 8 },
  subtitle: { color: colors.textSec, fontSize: 13, marginTop: 6 },

  form: { marginBottom: 24 },
  label: {
    color: colors.textSec, fontSize: 10.5, fontWeight: '600',
    letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  inputFocused: { borderColor: colors.primary },
  input: { color: colors.text, fontSize: 14, paddingHorizontal: 14, paddingVertical: 13 },
  inputFlex: { flex: 1 },
  eyeBtn: { paddingHorizontal: 14 },
  forgotBtn: { alignSelf: 'flex-end', paddingVertical: 8 },
  forgotText: { color: colors.primary, fontSize: 12, fontWeight: '500' },
  errorText: { color: colors.danger, fontSize: 12, marginBottom: 8 },

  primaryBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 16,
    shadowColor: colors.primary, shadowOpacity: 0.31, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },

  signupRow: { flexDirection: 'row', justifyContent: 'center' },
  signupText: { color: colors.textSec, fontSize: 13 },
  signupLink: { color: colors.primary, fontSize: 13, fontWeight: '600' },

  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 16, gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 11, fontWeight: '500' },

  socialRow: { flexDirection: 'row', gap: 10 },
  socialBtn: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  googleG: { color: colors.text, fontSize: 15, fontWeight: '700', fontStyle: 'italic' },

  legal: { color: colors.textMuted, fontSize: 10, lineHeight: 16, textAlign: 'center' },
  legalLink: { color: colors.primary },
});
