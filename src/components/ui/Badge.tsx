import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'star' | 'neutral';

type Props = {
  children: string;
  tone?: Tone;
};

const TONES: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: `${colors.primary}2E`, fg: '#60A5FA' },
  success: { bg: 'rgba(16,185,129,0.15)', fg: colors.success },
  warning: { bg: 'rgba(245,158,11,0.15)', fg: colors.warning },
  danger: { bg: 'rgba(239,68,68,0.15)', fg: colors.danger },
  star: { bg: 'rgba(251,191,36,0.15)', fg: colors.star },
  neutral: { bg: colors.scrimLight, fg: colors.textSec },
};

export function Badge({ children, tone = 'primary' }: Props) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 10, fontWeight: '700' },
});
