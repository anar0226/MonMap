import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { supabase } from '../../lib/supabase';
import { useSupabase } from '../../context/SupabaseContext';
import type { AppStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Feedback'> };

export default function FeedbackScreen({ navigation }: Props) {
  const { session } = useSupabase();
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  const [category, setCategory] = useState<'bug' | 'feature' | 'general'>('general');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const categories = [
    { key: 'general' as const, label: 'Ерөнхий', icon: '💬' },
    { key: 'bug' as const, label: 'Алдаа', icon: '🐛' },
    { key: 'feature' as const, label: 'Санал', icon: '💡' },
  ];

  async function handleSubmit() {
    if (!body.trim()) {
      Alert.alert('Санал хүсэлтээ бичнэ үү');
      return;
    }
    setSubmitting(true);
    try {
      await supabase.from('feedback').insert({
        user_id: session?.user?.id ?? null,
        category,
        body: body.trim(),
      });
      setSubmitted(true);
    } catch {
      Alert.alert('Алдаа гарлаа', 'Дахин оролдоно уу.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={s.flex}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          </Pressable>
          <Text style={s.title}>Санал хүсэлт</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {submitted ? (
          <View style={s.successCard}>
            <View style={s.successIcon}>
              <Ionicons name="checkmark-circle" size={40} color="#10B981" />
            </View>
            <Text style={s.successTitle}>Баярлалаа!</Text>
            <Text style={s.successDesc}>
              Таны санал хүсэлт амжилттай илгээгдлээ. Бид таны саналыг анхааралтай хянана.
            </Text>
            <Pressable style={s.backNavBtn} onPress={() => navigation.goBack()}>
              <Text style={s.backNavBtnText}>Буцах</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>АНГИЛАЛ</Text>
            <View style={s.categoryRow}>
              {categories.map(c => (
                <Pressable
                  key={c.key}
                  style={[s.categoryBtn, category === c.key && s.categoryBtnActive]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text style={s.categoryIcon}>{c.icon}</Text>
                  <Text style={[s.categoryLabel, category === c.key && s.categoryLabelActive]}>
                    {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[s.sectionLabel, { marginTop: 20 }]}>САНАЛ ХҮСЭЛТ</Text>
            <TextInput
              style={s.input}
              placeholder="Таны санал, хүсэлт, эсвэл алдааны мэдэгдэл..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={body}
              onChangeText={setBody}
              textAlignVertical="top"
            />

            <Pressable
              style={[s.submitBtn, (!body.trim() || submitting) && { opacity: 0.5 }]}
              onPress={handleSubmit}
              disabled={!body.trim() || submitting}
            >
              <Text style={s.submitBtnText}>
                {submitting ? 'Илгээж байна...' : 'Илгээх'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.bg },
    safeTop: { backgroundColor: colors.bg },
    header: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12,
    },
    backBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: colors.inputBg,
      borderWidth: 1, borderColor: colors.border,
      alignItems: 'center', justifyContent: 'center',
    },
    title: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80 },
    sectionLabel: {
      color: colors.textMuted, fontSize: 10.5, fontWeight: '600',
      letterSpacing: 1, marginBottom: 10,
    },
    categoryRow: { flexDirection: 'row', gap: 10 },
    categoryBtn: {
      flex: 1, alignItems: 'center', gap: 6,
      paddingVertical: 14,
      backgroundColor: colors.cardBg, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
    },
    categoryBtnActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}14`,
    },
    categoryIcon: { fontSize: 20 },
    categoryLabel: { color: colors.textSec, fontSize: 12, fontWeight: '600' },
    categoryLabelActive: { color: colors.primary },
    input: {
      backgroundColor: colors.cardBg, borderRadius: 14,
      borderWidth: 1, borderColor: colors.border,
      color: colors.text, fontSize: 14,
      paddingHorizontal: 14, paddingVertical: 14,
      minHeight: 140,
    },
    submitBtn: {
      backgroundColor: colors.primary, borderRadius: 12,
      paddingVertical: 14, alignItems: 'center', marginTop: 16,
    },
    submitBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
    successCard: {
      alignItems: 'center',
      backgroundColor: colors.cardBg, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
      padding: 32, marginTop: 40,
    },
    successIcon: { marginBottom: 14 },
    successTitle: { color: colors.success, fontSize: 18, fontWeight: '800', marginBottom: 8 },
    successDesc: { color: colors.textSec, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    backNavBtn: {
      marginTop: 20,
      backgroundColor: colors.inputBg,
      borderRadius: 12, borderWidth: 1, borderColor: colors.border,
      paddingVertical: 12, paddingHorizontal: 32,
    },
    backNavBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  });
}
