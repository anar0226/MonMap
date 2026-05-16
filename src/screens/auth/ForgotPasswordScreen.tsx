import React, { useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { gradientPrimary } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import type { AuthStackParamList } from '../../navigation';
import HCaptchaModal from '../../components/HCaptchaModal';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'> };
type Step = 'input' | 'verify' | 'reset';

const CODE_LEN = 6;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);

  const [step, setStep] = useState<Step>('input');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const inputs = useRef<Array<TextInput | null>>([]);

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  async function handleSend() {
    if (!email.trim()) { setError('Имэйл хаягаа оруулна уу'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Зөв и-мэйл хаяг оруулна уу');
      return;
    }
    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    setLoading(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { captchaToken },
    );
    setLoading(false);
    if (authError) {
      setError('Алдаа гарлаа. Дахин оролдоно уу.');
      return;
    }
    setStep('verify');
  }

  // ── Step 2: verify 6-digit code ───────────────────────────────────────────
  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[i] = '';
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      const arr = clean.slice(0, CODE_LEN).split('');
      const next = Array(CODE_LEN).fill('').map((_, idx) => arr[idx] ?? '');
      setDigits(next);
      const lastFilled = Math.min(arr.length, CODE_LEN) - 1;
      inputs.current[lastFilled]?.focus();
      if (arr.length >= CODE_LEN) verifyCode(next.join(''));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (i < CODE_LEN - 1) inputs.current[i + 1]?.focus();
    if (next.every(d => d) && next.join('').length === CODE_LEN) verifyCode(next.join(''));
  }

  function onKeyPress(i: number, key: string) {
    if (key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  }

  async function verifyCode(code: string) {
    setError('');
    setLoading(true);
    const { error: vErr } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'recovery',
    });
    setLoading(false);
    if (vErr) {
      setError('Код буруу эсвэл хугацаа дууссан');
      return;
    }
    setStep('reset');
  }

  // ── Step 3: set new password ──────────────────────────────────────────────
  async function handleReset() {
    if (password.length < 8) {
      setError('Нууц үг дор хаяж 8 тэмдэгт байх ёстой');
      return;
    }
    if (password !== confirm) {
      setError('Нууц үг таарахгүй байна');
      return;
    }
    setError('');
    setLoading(true);
    const { error: rErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (rErr) {
      setError(rErr.message || 'Нууц үг шинэчлэхэд алдаа гарлаа');
      return;
    }
    navigation.navigate('Login');
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
            <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color={colors.textSec} />
              <Text style={s.backText}>Буцах</Text>
            </Pressable>

            {step === 'input' && (
              <View style={s.body}>
                <View style={s.iconBox}>
                  <Ionicons name="mail-outline" size={30} color={colors.primary} />
                </View>
                <Text style={s.title}>Нууц үг сэргээх</Text>
                <Text style={s.subtitle}>
                  Бүртгэлтэй имэйл хаягаа оруулна уу.{'\n'}6 оронтой баталгаажуулах код илгээнэ.
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

                <Pressable onPress={handleSend} disabled={loading} style={s.btnWrap}>
                  <LinearGradient
                    colors={!loading ? gradientPrimary : ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.primaryBtn}
                  >
                    <Text style={s.primaryBtnText}>{loading ? 'Илгээж байна...' : 'Код илгээх'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}

            {step === 'verify' && (
              <View style={s.body}>
                <View style={s.iconBox}>
                  <Ionicons name="keypad-outline" size={30} color={colors.primary} />
                </View>
                <Text style={s.title}>Код оруулах</Text>
                <Text style={s.subtitle}>
                  <Text style={{ color: colors.text, fontWeight: '600' }}>{email.trim()}</Text>
                  {' '}руу илгээсэн 6 оронтой кодыг оруулна уу.
                </Text>

                <View style={s.codeRow}>
                  {digits.map((d, i) => (
                    <TextInput
                      key={i}
                      ref={r => { inputs.current[i] = r; }}
                      style={[s.codeInput, d ? s.codeInputFilled : null]}
                      value={d}
                      onChangeText={v => setDigit(i, v)}
                      onKeyPress={({ nativeEvent }) => onKeyPress(i, nativeEvent.key)}
                      keyboardType="number-pad"
                      maxLength={CODE_LEN}
                      textContentType="oneTimeCode"
                      autoComplete={Platform.OS === 'ios' ? 'one-time-code' : 'sms-otp'}
                      selectTextOnFocus
                      autoFocus={i === 0}
                    />
                  ))}
                </View>

                {error ? <Text style={s.errorText}>{error}</Text> : null}

                <Pressable
                  onPress={() => verifyCode(digits.join(''))}
                  disabled={loading || digits.some(d => !d)}
                  style={s.btnWrap}
                >
                  <LinearGradient
                    colors={!loading && digits.every(d => d) ? gradientPrimary : ['rgba(0,83,163,0.38)', 'rgba(26,63,168,0.38)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.primaryBtn}
                  >
                    <Text style={s.primaryBtnText}>{loading ? 'Шалгаж байна...' : 'Баталгаажуулах'}</Text>
                  </LinearGradient>
                </Pressable>

                <Pressable onPress={() => { setStep('input'); setDigits(Array(CODE_LEN).fill('')); setError(''); }} style={s.linkBtn}>
                  <Text style={s.linkBtnText}>Имэйл дахин оруулах</Text>
                </Pressable>
              </View>
            )}

            {step === 'reset' && (
              <View style={s.body}>
                <View style={[s.iconBox, s.iconBoxSuccess]}>
                  <Ionicons name="lock-closed-outline" size={30} color={colors.success} />
                </View>
                <Text style={s.title}>Шинэ нууц үг</Text>
                <Text style={s.subtitle}>Шинэ нууц үгээ оруулна уу.</Text>

                <Text style={s.label}>ШИНЭ НУУЦ ҮГ</Text>
                <View style={[s.inputWrap, passwordFocused && s.inputFocused, { marginBottom: 12 }]}>
                  <TextInput
                    style={s.input}
                    placeholder="Дор хаяж 8 тэмдэгт"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!passwordVisible}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    autoFocus
                  />
                  <Pressable onPress={() => setPasswordVisible(v => !v)} style={s.eyeBtn} hitSlop={8}>
                    <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSec} />
                  </Pressable>
                </View>

                <Text style={s.label}>НУУЦ ҮГ ДАВТАХ</Text>
                <View style={[s.inputWrap, confirmFocused && s.inputFocused]}>
                  <TextInput
                    style={s.input}
                    placeholder="Нууц үгийг давтана уу"
                    placeholderTextColor={colors.textMuted}
                    secureTextEntry={!confirmVisible}
                    value={confirm}
                    onChangeText={setConfirm}
                    onFocus={() => setConfirmFocused(true)}
                    onBlur={() => setConfirmFocused(false)}
                  />
                  <Pressable onPress={() => setConfirmVisible(v => !v)} style={s.eyeBtn} hitSlop={8}>
                    <Ionicons name={confirmVisible ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textSec} />
                  </Pressable>
                </View>

                {error ? <Text style={s.errorText}>{error}</Text> : null}

                <Pressable onPress={handleReset} disabled={loading} style={s.btnWrap}>
                  <LinearGradient
                    colors={!loading ? gradientPrimary : ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={s.primaryBtn}
                  >
                    <Text style={s.primaryBtnText}>{loading ? 'Хадгалж байна...' : 'Нууц үг шинэчлэх'}</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
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

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    scroll: { flexGrow: 1, paddingBottom: 40 },
    backBtn: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 6 },
    backText: { color: colors.textSec, fontSize: 13, fontWeight: '500' },
    body: { flex: 1, paddingHorizontal: 22, paddingTop: 8, alignItems: 'center' },

    iconBox: {
      width: 72, height: 72, borderRadius: 22,
      backgroundColor: `${colors.primary}26`,
      borderWidth: 1, borderColor: `${colors.primary}38`,
      alignItems: 'center', justifyContent: 'center', marginBottom: 24,
    },
    iconBoxSuccess: { backgroundColor: `${colors.success}21`, borderColor: `${colors.success}45` },

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
    eyeBtn: { paddingHorizontal: 12 },
    errorText: { color: colors.danger, fontSize: 12, marginTop: 6, alignSelf: 'flex-start' },

    codeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 16 },
    codeInput: {
      width: 46, height: 56, borderRadius: 12,
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
      color: colors.text, fontSize: 22, fontWeight: '600', textAlign: 'center',
    },
    codeInputFilled: { borderColor: colors.primary },

    btnWrap: { marginTop: 18, width: '100%' },
    primaryBtn: {
      borderRadius: 12, paddingVertical: 14, alignItems: 'center',
      shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },
    linkBtn: { marginTop: 14, paddingVertical: 8 },
    linkBtnText: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  });
}
