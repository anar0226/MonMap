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
import { supabase } from '../../lib/supabase';
import { colors, gradientPrimary } from '../../theme';
import type { AuthStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'SignUp'> };

function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (!pw) return 0;
  if (pw.length < 6) return 1;
  if (pw.length < 10) return 2;
  return 3;
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

  const strength = passwordStrength(password);
  const pwMatch = confirm.length > 0 && confirm === password;
  const pwMismatch = confirm.length > 0 && confirm !== password;

  async function handleSignUp() {
    if (!name || !email || !password || !confirm) {
      setError('Бүх талбарыг бөглөнө үү');
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
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      navigation.navigate('VerifyOtp', {
        method: 'email',
        identifier: email.trim(),
        fullName: name.trim(),
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
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  brandLetter: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
});
