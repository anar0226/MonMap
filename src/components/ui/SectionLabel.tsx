import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { typography } from '../../theme';

type Props = { children: string };

export function SectionLabel({ children }: Props) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    ...typography.section,
    marginTop: 8,
    marginBottom: 8,
  },
});
