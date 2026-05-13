import React from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui';
import { spacing } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { TERMS_MN, PRIVACY_MN } from '../constants/legal';

type Kind = 'terms' | 'privacy';

interface Props {
  navigation: { goBack: () => void };
  route: { params?: { kind?: Kind } };
}

export default function LegalScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  const kind: Kind = route.params?.kind ?? 'terms';
  const doc = kind === 'terms' ? TERMS_MN : PRIVACY_MN;

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={s.header}>
        <Pressable onPress={navigation.goBack} hitSlop={12} style={s.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{doc.title}</Text>
        <View style={s.back} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{doc.title}</Text>
        <Text style={s.meta}>Сүүлд шинэчилсэн: {doc.updated}</Text>

        {doc.sections.map((sec, i) => (
          <View key={i} style={s.section}>
            {sec.heading && <Text style={s.h2}>{sec.heading}</Text>}
            {sec.paragraphs.map((p, j) => (
              <Text key={j} style={s.p}>{p}</Text>
            ))}
            {sec.bullets && sec.bullets.map((b, j) => (
              <View key={j} style={s.bulletRow}>
                <Text style={s.bulletDot}>•</Text>
                <Text style={s.bullet}>{b}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1, textAlign: 'center' },
    body: { padding: spacing.lg, paddingBottom: spacing['2xl'] },
    title: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5, marginBottom: 4 },
    meta: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg },
    section: { marginBottom: spacing.md },
    h2: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: 6 },
    p: { fontSize: 14, lineHeight: 22, color: colors.textSec, marginBottom: 6 },
    bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 4, paddingLeft: 4 },
    bulletDot: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
    bullet: { flex: 1, fontSize: 14, lineHeight: 22, color: colors.textSec },
  });
}
