import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

type Props = { label?: string };

export function Divider({ label }: Props) {
  if (!label) return <View style={styles.line} />;
  return (
    <View style={styles.row}>
      <View style={styles.flexLine} />
      <Text style={styles.text}>{label}</Text>
      <View style={styles.flexLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: { height: 1, backgroundColor: colors.border },
  flexLine: { flex: 1, height: 1, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.1,
    marginHorizontal: 12,
  },
});
