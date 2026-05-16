import React, { useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { gradientPrimary } from '../../theme';
import { useTheme } from '../../context/ThemeContext';
import { useSupabase } from '../../context/SupabaseContext';

export default function CompleteProfileScreen() {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  const { refreshProfile } = useSupabase();
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Нэрээ оруулна уу');
      return;
    }
    setError('');
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const [{ error: dbErr }, { error: metaErr }] = await Promise.all([
        supabase.from('users').upsert({ id: user.id, full_name: trimmed }, { onConflict: 'id' }),
        supabase.auth.updateUser({ data: { full_name: trimmed } }),
      ]);
      if (dbErr || metaErr) {
        setError('Хадгалахад алдаа гарлаа. Дахин оролдоно уу.');
        setLoading(false);
        return;
      }
    }
    await refreshProfile();
    setLoading(false);
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.flex}>
          <View style={s.inner}>
            <View style={s.header}>
              <Image source={require('../../../assets/icon.png')} style={s.brandTile} />
              <View style={{ marginLeft: 10 }}>
                <Text style={s.appName}>MONMAP</Text>
                <Text style={s.pageTitle}>Профайл үүсгэх</Text>
              </View>
            </View>

            <Text style={s.intro}>
              Таны нэрийг оруулна уу. Энэ нь таны профайлд харагдана.
            </Text>

            <Text style={s.label}>НЭРИЙН ЭХ</Text>
            <View style={[s.inputWrap, focused && s.inputFocused]}>
              <TextInput
                style={s.input}
                placeholder="Бат-Эрдэнэ"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoCapitalize="words"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <Pressable onPress={handleSave} disabled={loading}>
              <LinearGradient
                colors={!loading && name.trim() ? gradientPrimary : ['rgba(0,83,163,0.38)', 'rgba(26,63,168,0.38)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={s.submitBtn}
              >
                <Text style={s.submitBtnText}>{loading ? 'Түр хүлээнэ үү...' : 'Үргэлжлүүлэх'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    flex: { flex: 1 },
    inner: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 28 },
    brandTile: { width: 34, height: 34, borderRadius: 10 },
    appName: { color: colors.textMuted, fontSize: 9, fontWeight: '600', letterSpacing: 1.5 },
    pageTitle: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
    intro: { color: colors.textSec, fontSize: 13, lineHeight: 19, marginBottom: 24 },
    label: {
      color: colors.textSec, fontSize: 10.5, fontWeight: '600',
      letterSpacing: 1.2, marginBottom: 8, textTransform: 'uppercase',
    },
    inputWrap: {
      backgroundColor: colors.inputBg, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border, marginBottom: 6,
    },
    inputFocused: { borderColor: colors.primary },
    input: { color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 13 },
    errorText: { color: colors.danger, fontSize: 12, marginTop: 4, marginBottom: 4 },
    submitBtn: {
      borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16,
      shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    submitBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600', letterSpacing: 0.2 },
  });
}
