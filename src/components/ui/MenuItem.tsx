import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme';

type Props = {
  icon: string;
  iconColor?: string;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  showDivider?: boolean;
};

export function MenuItem({
  icon,
  iconColor = colors.primary,
  label,
  subtitle,
  onPress,
  showDivider = true,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        showDivider && styles.divider,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: `${iconColor}26` }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  divider: { borderBottomWidth: 0.5, borderBottomColor: colors.border },
  pressed: { backgroundColor: colors.scrimLight },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 15 },
  content: { flex: 1, marginLeft: 12 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
  subtitle: { color: colors.textSec, fontSize: 11, marginTop: 2 },
  chevron: { color: colors.textMuted, fontSize: 20 },
});
