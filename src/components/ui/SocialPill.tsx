import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../../theme';

type Props = {
  icon: string;
  label: string;
  onPress?: () => void;
};

export function SocialPill({ icon, label, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
      onPress={onPress}
    >
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    backgroundColor: colors.scrimLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  icon: { fontSize: 16, marginBottom: 4 },
  label: {
    color: colors.textSec,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
});
