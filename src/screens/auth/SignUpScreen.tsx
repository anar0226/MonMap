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

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'> };

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  if (pw.length < 8) return 1;
  
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;

  if (classes < 2) return 1; // Only lowercase or only numbers
  if (classes >= 3 && pw.length >= 8) return 3; // Strong: 3+ classes and 8+ chars
  if (classes === 2 && pw.length >= 12) return 3; // Strong: 2 classes but 12+ chars
  return 2; // Medium
}

const strengthColors = ['transparent', colors.danger, colors.warning, colors.success];
const strengthLabels = ['', 'Сул', 'Дунд', 'Хүчтэй'];

export default function SignUpScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwVisible, setPwVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [focused, setFocused] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaOpen, setCaptchaOpen] = useState(false);

  const strength = passwordStrength(password);
  const pwMatch = confirm.length > 0 && confirm === password;
  const pwMismatch = confirm.length > 0 && confirm !== password;

  async function handleFacebookSignUp() {
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

  async function handleSignUp() {
    const trimmedName  = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password || !confirm) {
      setError('Бүх талбарыг бөглөнө үү');
      return;
    }
    // RFC-5322-lite: catches the common typos without false-rejecting valid
    // unicode local-parts. Server still has the final say.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Зөв и-мэйл хаяг оруулна уу');
      return;
    }
    // Supabase's default minimum is 6, but that's brute-forceable.
    // Match what the strength meter already advertises as "Сул" → "Дунд".
    if (password.length < 8) {
      setError('Нууц үг хамгийн багадаа 8 тэмдэгт байх ёстой');
      return;
    }
    if (password !== confirm) {
      setError('Нууц үг таарахгүй байна');
      return;
    }
    if (!agreeToTerms) {
      setError('Үйлчилгээний нөхцөлтэй зөвшөөрнө үү');
      return;
    }
    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    const trimmedName  = name.trim();
    const trimmedEmail = email.trim();
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { data: { full_name: trimmedName }, captchaToken },
    });
    setLoading(false);
    if (authError) {
      const msg = authError.message;
      if (msg.includes('already registered')) setError('Имэйл бүртгэлтэй байна');
      else setError('Бүртгүүлэхэд алдаа гарлаа');
    } else {
      navigation.navigate('VerifyOtp', {
        method: 'email',
        identifier: trimmedEmail,
        fullName: trimmedName,
      });
    }
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            {/* Header row */}
            <View style={s.header}>
              <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
                <Ionicons name="arrow-back" size={20} color={colors.textSec} />
              </Pressable>
              <LinearGradient colors={gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.brandTile}>
                <Text style={s.brandLetter}>M</Text>
              </LinearGradient>
              <View style={{ marginLeft: 10 }}>
                <Text style={s.appName}>MONMAP</Text>
                <Text style={s.pageTitle}>Шинээр бүртгүүлэх</Text>
              </View>
            </View>

            {/* Name */}
            <Text style={s.label}>НЭР</Text>
            <View style={[s.inputWrap, focused === 'name' && s.inputFocused]}>
              <TextInput
                style={s.input}
                placeholder="Таны нэр"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                onFocus={() => setFocused('name')}
                onBlur={() => setFocused('')}
              />
            </View>

            {/* Email */}
            <Text style={[s.label, { marginTop: 12 }]}>ИМЭЙЛ</Text>
            <View style={[s.inputWrap, focused === 'email' && s.inputFocused]}>
              <TextInput
                style={s.input}
                placeholder="та@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused('email')}
                onBlur={() => setFocused('')}
              />
            </View>

            {/* Password */}
            <Text style={[s.label, { marginTop: 12 }]}>НУУЦ ҮГ</Text>
            <View style={[s.inputWrap, focused === 'pw' && s.inputFocused]}>
              <TextInput
                style={[s.input, s.inputFlex]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!pwVisible}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused('pw')}
                onBlur={() => setFocused('')}
              />
              <Pressable onPress={() => setPwVisible(v => !v)} style={s.eyeBtn} hitSlop={8}>
                <Ionicons name={pwVisible ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
              </Pressable>
            </View>
            {password.length > 0 && (
              <View style={s.strengthRow}>
                <View style={s.strengthTrack}>
                  <View style={[s.strengthFill, { width: `${(strength / 3) * 100}%` as any, backgroundColor: strengthColors[strength] }]} />
                </View>
                <Text style={[s.strengthLabel, { color: strengthColors[strength] }]}>{strengthLabels[strength]}</Text>
              </View>
            )}

            {/* Confirm */}
            <Text style={[s.label, { marginTop: 12 }]}>НУУЦ ҮГ ДАВТАХ</Text>
            <View style={[s.inputWrap, focused === 'pw2' && s.inputFocused]}>
              <TextInput
                style={[s.input, s.inputFlex]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!confirmVisible}
                value={confirm}
                onChangeText={setConfirm}
                onFocus={() => setFocused('pw2')}
                onBlur={() => setFocused('')}
              />
              <View style={s.confirmRight}>
                {confirm.length > 0 && (
                  <Ionicons
                    name={pwMatch ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={pwMatch ? colors.success : colors.danger}
                  />
                )}
                <Pressable onPress={() => setConfirmVisible(v => !v)} style={s.eyeBtn} hitSlop={8}>
                  <Ionicons name={confirmVisible ? 'eye-off-outline' : 'eye-outline'} size={17} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>
            {pwMismatch && <Text style={s.errorSmall}>Нууц үг таарахгүй байна</Text>}

            {/* Terms */}
            <View style={s.termsRow}>
              <Pressable onPress={() => setAgreeToTerms(v => !v)} hitSlop={8}>
                <View style={[s.checkbox, agreeToTerms && s.checkboxChecked]}>
                  {agreeToTerms && <Ionicons name="checkmark" size={11} color="#fff" />}
                </View>
              </Pressable>
              <Text style={s.termsText}>
                <Text
                  style={s.termsLink}
                  onPress={() => navigation.navigate('Legal', { kind: 'terms' })}
                >
                  Үйлчилгээний нөхцөл
                </Text>
                {' '}болон{' '}
                <Text
                  style={s.termsLink}
                  onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}
                >
                  Нууцлалын бодлого
                </Text>
                -ыг зөвшөөрсөн болно.
              </Text>
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            {/* Submit */}
            <Pressable onPress={handleSignUp} disabled={loading || !agreeToTerms}>
              <LinearGradient
                colors={agreeToTerms && !loading ? gradientPrimary : ['rgba(0,83,163,0.38)', 'rgba(26,63,168,0.38)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.submitBtn}
              >
                <Text style={s.submitBtnText}>{loading ? 'Түр хүлээнэ үү...' : 'Бүртгүүлэх'}</Text>
              </LinearGradient>
            </Pressable>

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>эсвэл</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Social signup row */}
            <View style={s.socialRow}>
              <Pressable style={s.socialBtn} onPress={handleFacebookSignUp} disabled={loading}>
                <Ionicons name="logo-facebook" size={18} color="#1877F2" />
              </Pressable>
              <Pressable style={s.socialBtn} onPress={() => navigation.navigate('PhoneLogin')} disabled={loading}>
                <Ionicons name="call-outline" size={18} color={colors.text} />
              </Pressable>
            </View>

            {/* Login link */}
            <View style={s.loginRow}>
              <Text style={s.loginText}>Бүртгэлтэй хаяг байгаа юу? </Text>
              <Pressable onPress={() => navigation.goBack()}>
                <Text style={s.loginLink}>Нэвтрэх</Text>
              </Pressable>
            </View>
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
  scroll: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  backBtn: { marginRight: 12 },
  brandTile: {
    width: 44, height: 44, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.primary, shadowOpacity: 0.33, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  brandLetter: { color: '#fff', fontWeight: '700', fontSize: 19, letterSpacing: -0.3 },
  appName: { color: colors.textMuted, fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
  pageTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },

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
  eyeBtn: { paddingHorizontal: 12 },
  confirmRight: { flexDirection: 'row', alignItems: 'center', paddingRight: 2 },

  strengthRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  strengthTrack: { flex: 1, height: 2.5, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 10, fontWeight: '600' },
  errorSmall: { color: colors.danger, fontSize: 10.5, marginTop: 4 },

  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14, gap: 10 },
  checkbox: {
    width: 18, height: 18, borderRadius: 5,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  termsText: { flex: 1, color: colors.textSec, fontSize: 12, lineHeight: 18 },
  termsLink: { color: colors.primary },

  errorText: { color: colors.danger, fontSize: 12, marginTop: 8 },
  submitBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14,
    shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  submitBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },

  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 14 },
  loginText: { color: colors.textSec, fontSize: 12.5 },
  loginLink: { color: colors.primary, fontSize: 12.5, fontWeight: '600' },

  divider: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 16, gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: 11, fontWeight: '500' },

  socialRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  socialBtn: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
});
