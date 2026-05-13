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
import { gradientPrimary } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import type { AuthStackParamList } from '../../navigation';
import HCaptchaModal from '../../components/HCaptchaModal';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'PhoneLogin'> };

export default function PhoneLoginScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  // Store only the national digits (8 digits after +976)
  const [digits, setDigits] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [captchaOpen, setCaptchaOpen] = useState(false);

  function handleDigitsChange(text: string) {
    // Strip anything that isn't a digit; cap at 8
    const cleaned = text.replace(/\D/g, '').slice(0, 8);
    setDigits(cleaned);
  }

  async function handleSend() {
    if (digits.length !== 8) {
      setError('Зөв утасны дугаар оруулна уу (+976XXXXXXXX)');
      return;
    }
    setError('');
    setCaptchaOpen(true);
  }

  async function onCaptchaSolved(captchaToken: string) {
    setCaptchaOpen(false);
    const compact = '+976' + digits;
    setLoading(true);
    try {
      if (__DEV__) console.log('[PhoneOTP] Sending OTP to:', compact);
      const { data, error: otpError } = await supabase.auth.signInWithOtp({
        phone: compact,
        options: { captchaToken },
      });
      if (__DEV__) {
        console.log('[PhoneOTP] Response data:', JSON.stringify(data, null, 2));
        if (otpError) console.error('[PhoneOTP] Error:', JSON.stringify(otpError, null, 2));
      }
      if (otpError) {
        setError(otpError.message);
        return;
      }
      navigation.navigate('VerifyOtp', { method: 'phone', identifier: compact });
    } catch (e) {
      if (__DEV__) console.error('[PhoneOTP] Unexpected error:', e);
      setError('Алдаа гарлаа. Дахин оролдоно үз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={s.flex}
          keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
        >
          <ScrollView
            contentContainerStyle={s.inner}
            keyboardShouldPersistTaps="handled"
          >
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
              {/* Locked country code badge */}
              <View style={s.prefixBadge}>
                <Text style={s.prefixText}>+976</Text>
              </View>
              <View style={s.separator} />
              <TextInput
                style={s.input}
                placeholder="99000000"
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                value={digits}
                onChangeText={handleDigitsChange}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                maxLength={8}
                autoFocus
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <View style={s.btnShadow}>
              <Pressable
                onPress={handleSend}
                disabled={loading}
                android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false }}
                style={s.pressable}
              >
                <LinearGradient
                  colors={loading ? ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)'] : gradientPrimary}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={s.primaryBtnGradient}
                >
                  <Text style={s.primaryBtnText}>{loading ? 'Түр хүлээнэ үү...' : 'SMS код илгээх'}</Text>
                </LinearGradient>
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

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    inner: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 40 },

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

    // Locked +976 badge
    prefixBadge: {
      paddingHorizontal: 14,
      paddingVertical: 13,
      justifyContent: 'center',
    },
    prefixText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    separator: {
      width: 1,
      height: 22,
      backgroundColor: colors.border,
      marginRight: 4,
    },

    input: { flex: 1, color: colors.text, fontSize: 16, paddingHorizontal: 12, paddingVertical: 13 },
    errorText: { color: colors.danger, fontSize: 12, marginBottom: 10 },

    // Shadow wrapper lives outside the Pressable so elevation doesn't steal
    // Android touch events.
    btnShadow: {
      marginTop: 14,
      borderRadius: 12,
      shadowColor: colors.primary,
      shadowOpacity: 0.31,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    pressable: {
      borderRadius: 12,
      overflow: 'hidden',
    },
    primaryBtnGradient: {
      borderRadius: 12, paddingVertical: 14, alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },
  });
}
