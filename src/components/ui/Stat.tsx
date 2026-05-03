import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

type Props = { value: string | number; label: string };

export function Stat({ value, label }: Props) {
  return (
    <View style={styles.stat}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flex: 1, alignItems: 'center' },
  value: { color: colors.text, fontSize: 20, fontWeight: '800' },
  label: { color: colors.textSec, fontSize: 11, marginTop: 3 },
});
