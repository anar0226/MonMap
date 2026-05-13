import React from 'react';
import {
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

type Props = { navigation: NativeStackNavigationProp<AppStackParamList, 'About'> };

export default function AboutScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={s.flex}>
      <SafeAreaView edges={['top']} style={s.safeTop}>
        <View style={s.header}>
          <Pressable onPress={() => navigation.goBack()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.textSec} />
          </Pressable>
          <Text style={s.title}>Тухай</Text>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content}>
        <View style={s.logoCard}>
          <View style={s.logoCircle}>
            <Text style={s.logoLetter}>M</Text>
          </View>
          <Text style={s.appName}>MonMap</Text>
          <Text style={s.tagline}>Монголын газрын зураг</Text>
          <Text style={s.version}>v1.0.0</Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>MonMap гэж юу вэ?</Text>
          <Text style={s.bodyText}>
            MonMap нь Монгол улсын газрууд, бизнесүүд, үйлчилгээний байгууллагуудыг нэг газраас хайж, чиглэл авч, захиалга хийх боломжтой газрын зургийн аппликейшн юм.
          </Text>
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Онцлог шинж чанарууд</Text>
          <FeatureRow icon="map" text="Mapbox-ийн дэвшилтэт газрын зураг" s={s} colors={colors} />
          <FeatureRow icon="search" text="Газрууд хайх, ангилалаар шүүх" s={s} colors={colors} />
          <FeatureRow icon="navigate" text="Олон төрлийн тээврийн хэрэгслээр чиглэл авах" s={s} colors={colors} />
          <FeatureRow icon="calendar" text="Рестораны захиалга онлайнаар" s={s} colors={colors} />
          <FeatureRow icon="star" text="Сэтгэгдэл бичих, унших" s={s} colors={colors} />
          <FeatureRow icon="bookmark" text="Газрууд хадгалах" s={s} colors={colors} />
        </View>

        <View style={s.card}>
          <Text style={s.sectionTitle}>Ашигласан технологиуд</Text>
          <Text style={s.bodyText}>React Native · Expo · Mapbox · Supabase</Text>
        </View>

        <View style={s.row}>
          <Pressable style={s.linkBtn} onPress={() => navigation.navigate('Legal', { kind: 'terms' })}>
            <Text style={s.linkText}>Үйлчилгээний нөхцөл</Text>
          </Pressable>
          <Pressable style={s.linkBtn} onPress={() => navigation.navigate('Legal', { kind: 'privacy' })}>
            <Text style={s.linkText}>Нууцлалын бодлого</Text>
          </Pressable>
        </View>

        <Text style={s.copyright}>© 2026 MonMap. Бүх эрх хуулиар хамгаалагдсан.</Text>
      </ScrollView>
    </View>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];
type Styles = ReturnType<typeof makeStyles>;

function FeatureRow({ icon, text, s, colors }: { icon: string; text: string; s: Styles; colors: Colors }) {
  return (
    <View style={s.featureRow}>
      <Ionicons name={icon as any} size={16} color={colors.primary} />
      <Text style={s.featureText}>{text}</Text>
    </View>
  );
}

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
    content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 80, gap: 16 },
    logoCard: {
      alignItems: 'center',
      backgroundColor: colors.cardBg, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
      padding: 28,
    },
    logoCircle: {
      width: 64, height: 64, borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    },
    logoLetter: { color: '#fff', fontSize: 28, fontWeight: '800' },
    appName: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    tagline: { color: colors.textSec, fontSize: 13, marginTop: 4 },
    version: { color: colors.textMuted, fontSize: 11, marginTop: 8, fontWeight: '600' },
    card: {
      backgroundColor: colors.cardBg, borderRadius: 16,
      borderWidth: 1, borderColor: colors.border,
      padding: 16,
    },
    sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
    bodyText: { color: colors.textSec, fontSize: 13, lineHeight: 19 },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    featureText: { color: colors.textSec, fontSize: 13, flex: 1 },
    row: { flexDirection: 'row', gap: 10 },
    linkBtn: {
      flex: 1,
      backgroundColor: colors.cardBg, borderRadius: 12,
      borderWidth: 1, borderColor: colors.border,
      paddingVertical: 12, alignItems: 'center',
    },
    linkText: { color: colors.primary, fontSize: 12, fontWeight: '600' },
    copyright: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 4 },
  });
}
