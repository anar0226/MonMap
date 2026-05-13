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
import { useTheme } from '../../context/ThemeContext';
import type { AppStackParamList } from '../../navigation';

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'Contact'> };

const CONTACT_OPTIONS = [
  {
    icon: 'mail-outline' as const,
    label: 'Имэйл',
    value: 'hello@monmap.mn',
    onPress: () => Linking.openURL('mailto:hello@monmap.mn'),
  },
  {
    icon: 'call-outline' as const,
    label: 'Утас',
    value: '+976 7011-1234',
    onPress: () => Linking.openURL('tel:+97670111234'),
  },
  {
    icon: 'logo-facebook' as const,
    label: 'Facebook',
    value: 'facebook.com/monmap',
    onPress: () => Linking.openURL('https://facebook.com/monmap'),
  },
  {
    icon: 'logo-instagram' as const,
    label: 'Instagram',
    value: '@monmap.mn',
    onPress: () => Linking.openURL('https://instagram.com/monmap.mn'),
  },
];

export default function ContactScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.flex}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          </Pressable>
          <Text style={s.title}>Холбоо барих</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.heroCard}>
          <View style={s.heroIcon}>
            <Ionicons name="chatbubbles" size={28} color={colors.primary} />
          </View>
          <Text style={s.heroTitle}>Бидэнтэй холбогдоорой</Text>
          <Text style={s.heroDesc}>
            Асуулт, санал хүсэлт, эсвэл техникийн тусламж хэрэгтэй бол доорх сувгуудаар холбогдоорой.
          </Text>
        </View>

        <View style={s.card}>
          {CONTACT_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.label}
              style={[s.row, i < CONTACT_OPTIONS.length - 1 && s.rowBorder]}
              onPress={opt.onPress}
            >
              <View style={s.iconWrap}>
                <Ionicons name={opt.icon} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{opt.label}</Text>
                <Text style={s.value}>{opt.value}</Text>
              </View>
              <Ionicons name="open-outline" size={14} color={colors.textMuted} />
            </Pressable>
          ))}
        </View>

        <Text style={s.footerNote}>Хариу хүлээх хугацаа: ажлын 1-2 өдөр</Text>
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
    heroCard: {
      alignItems: 'center',
      backgroundColor: colors.cardBg, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
      padding: 24, marginBottom: 16,
    },
    heroIcon: {
      width: 56, height: 56, borderRadius: 16,
      backgroundColor: `${colors.primary}1A`,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    heroTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 },
    heroDesc: { color: colors.textSec, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    card: {
      backgroundColor: colors.cardBg, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
    },
    row: {
      flexDirection: 'row', alignItems: 'center',
      padding: 14, gap: 12,
    },
    rowBorder: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
    iconWrap: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: `${colors.primary}1A`,
      alignItems: 'center', justifyContent: 'center',
    },
    label: { color: colors.text, fontSize: 13, fontWeight: '600' },
    value: { color: colors.textSec, fontSize: 11, marginTop: 2 },
    footerNote: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 16 },
  });
}
