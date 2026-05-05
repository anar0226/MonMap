import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme';
import type { AppStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Help'> };

const FAQ = [
  {
    q: 'Газрын зураг ачаалагдахгүй байна?',
    a: 'Интернэт холболтоо шалгана уу. Мөн аппыг дахин ачаалж үзнэ үү.',
  },
  {
    q: 'Захиалгаа яаж цуцлах вэ?',
    a: 'Профайл → Захиалгууд хэсгээс захиалгаа сонгож цуцлах боломжтой.',
  },
  {
    q: 'Хадгалсан газруудаа хаанаас харах вэ?',
    a: 'Профайл → Хадгалсан газрууд хэсгээс харна уу.',
  },
  {
    q: 'Чиглэлийн мэдээлэл буруу байна?',
    a: 'Чиглэлийн мэдээлэл Mapbox-оос авагддаг тул зарим тохиолдолд зөрүүтэй байж болно. Бидэнтэй холбогдож мэдэгдэнэ үү.',
  },
];

export default function HelpScreen({ navigation }: Props) {
  return (
    <View style={s.flex}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          </Pressable>
          <Text style={s.title}>Тусламжийн төв</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.heroCard}>
          <View style={s.heroIcon}>
            <Ionicons name="help-buoy" size={28} color={colors.primary} />
          </View>
          <Text style={s.heroTitle}>Тусламж хэрэгтэй юу?</Text>
          <Text style={s.heroDesc}>
            Доорх түгээмэл асуултуудыг уншина уу. Хэрэв шийдэгдэхгүй бол бидэнтэй шууд холбогдоорой.
          </Text>
        </View>

        <Text style={s.sectionLabel}>ТҮГЭЭМЭЛ АСУУЛТУУД</Text>

        {FAQ.map((item, i) => (
          <View key={i} style={s.faqCard}>
            <Text style={s.question}>{item.q}</Text>
            <Text style={s.answer}>{item.a}</Text>
          </View>
        ))}

        <Pressable
          style={s.contactBtn}
          onPress={() => Linking.openURL('mailto:hello@monmap.mn?subject=Тусламж')}
        >
          <Ionicons name="mail-outline" size={18} color="#fff" />
          <Text style={s.contactBtnText}>Имэйл илгээх</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  safeTop: { backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 12,
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80 },
  heroCard: {
    alignItems: 'center',
    backgroundColor: colors.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    padding: 24, marginBottom: 20,
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: `${colors.primary}1A`,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  heroTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 },
  heroDesc: { color: colors.textSec, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  sectionLabel: {
    color: colors.textMuted, fontSize: 10.5, fontWeight: '600',
    letterSpacing: 1, marginBottom: 10,
  },
  faqCard: {
    backgroundColor: colors.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 10,
  },
  question: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  answer: { color: colors.textSec, fontSize: 12.5, lineHeight: 18 },
  contactBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 14, marginTop: 10, gap: 8,
  },
  contactBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
