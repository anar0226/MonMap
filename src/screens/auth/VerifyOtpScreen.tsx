import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
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
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { gradientPrimary } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import type { AuthStackParamList } from '../../navigation';
import HCaptchaModal from '../../components/HCaptchaModal';

type Props = NativeStackScreenProps<AuthStackParamList, 'VerifyOtp'>;

const CODE_LEN = 6;

export default function VerifyOtpScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  const { method, identifier, fullName } = route.params;
  const [digits, setDigits] = useState<string[]>(Array(CODE_LEN).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const inputs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    const t = setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits];
      next[i] = '';
      setDigits(next);
      return;
    }
    if (clean.length > 1) {
      // Pasted full code
      const arr = clean.slice(0, CODE_LEN).split('');
      const next = Array(CODE_LEN).fill('').map((_, idx) => arr[idx] ?? '');
      setDigits(next);
      const lastFilled = Math.min(arr.length, CODE_LEN) - 1;
      inputs.current[lastFilled]?.focus();
      if (arr.length >= CODE_LEN) submit(next.join(''));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (i < CODE_LEN - 1) inputs.current[i + 1]?.focus();
    if (next.every(d => d) && next.join('').length === CODE_LEN) submit(next.join(''));
  }

  function onKeyPress(i: number, key: string) {
    if (key === 'Backspace' && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  }

  async function submit(code: string) {
    setLoading(true);
    setError('');
    const params: any =
      method === 'email'
        ? { email: identifier, token: code, type: 'signup' }
        : { phone: identifier, token: code, type: 'sms' };
    const { data, error: vErr } = await supabase.auth.verifyOtp(params);
    if (vErr) {
      setError(vErr.message || 'Код буруу байна');
      setLoading(false);
      return;
    }
    if (data.user) {
      if (method === 'phone') {
        // Upsert ensures the users row exists even if the trigger missed it.
        await supabase.from('users').upsert(
          { id: data.user.id, phone: identifier },
          { onConflict: 'id', ignoreDuplicates: true },
        );
      } else if (fullName) {
        await Promise.all([
          supabase.from('users').update({ full_name: fullName }).eq('id', data.user.id),
          supabase.auth.updateUser({ data: { full_name: fullName } }),
        ]);
      }
    }
    setLoading(false);
  }

  function resend() {
    if (secondsLeft > 0) return;
    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    setResending(true);
    const { error: rErr } =
      method === 'email'
        ? await supabase.auth.resend({ type: 'signup', email: identifier, options: { captchaToken } })
        : await supabase.auth.signInWithOtp({ phone: identifier, options: { captchaToken } });
    setResending(false);
    if (rErr) setError(rErr.message);
    else setSecondsLeft(60);
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <View style={s.scroll}>
            <View style={s.header}>
              <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
                <Ionicons name="arrow-back" size={20} color={colors.textSec} />
              </Pressable>
              <Image source={require('../../../assets/icon.png')} style={s.brandTile} />
              <View style={{ marginLeft: 10 }}>
                <Text style={s.appName}>MONMAP</Text>
                <Text style={s.pageTitle}>Баталгаажуулах</Text>
              </View>
            </View>

            <Text style={s.intro}>
              {method === 'email' ? 'Имэйл' : 'Утас'} {identifier} руу илгээсэн 6 оронтой кодыг оруулна уу.
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

            <Pressable onPress={() => submit(digits.join(''))} disabled={loading || digits.some(d => !d)}>
              <LinearGradient
                colors={!loading && digits.every(d => d) ? gradientPrimary : ['rgba(0,83,163,0.38)', 'rgba(26,63,168,0.38)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.submitBtn}
              >
                <Text style={s.submitBtnText}>{loading ? 'Түр хүлээнэ үү...' : 'Баталгаажуулах'}</Text>
              </LinearGradient>
            </Pressable>

            <View style={s.resendRow}>
              <Text style={s.resendText}>Код ирээгүй юу? </Text>
              <Pressable onPress={resend} disabled={secondsLeft > 0 || resending}>
                <Text style={[s.resendLink, (secondsLeft > 0 || resending) && { opacity: 0.4 }]}>
                  {secondsLeft > 0 ? `Дахин илгээх (${secondsLeft})` : resending ? 'Илгээж байна...' : 'Дахин илгээх'}
                </Text>
              </Pressable>
            </View>
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

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    scroll: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    backBtn: { marginRight: 12 },
    brandTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    brandLetter: { color: '#fff', fontWeight: '700', fontSize: 14 },
    appName: { color: colors.textMuted, fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
    pageTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
    intro: { color: colors.textSec, fontSize: 13, lineHeight: 19, marginBottom: 22 },
    codeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
    codeInput: {
      width: 46, height: 56, borderRadius: 12,
      backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
      color: colors.text, fontSize: 22, fontWeight: '600', textAlign: 'center',
    },
    codeInputFilled: { borderColor: colors.primary },
    errorText: { color: colors.danger, fontSize: 12, marginTop: 4, marginBottom: 4 },
    submitBtn: {
      borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14,
      shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    submitBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },
    resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
    resendText: { color: colors.textSec, fontSize: 12.5 },
    resendLink: { color: colors.primary, fontSize: 12.5, fontWeight: '600' },
  });
}
