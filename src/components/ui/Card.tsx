import React, { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
  padding?: number;
  noPadding?: boolean;
};

export function Card({ children, style, padding = 16, noPadding = false }: Props) {
  return (
    <View style={[styles.card, !noPadding && { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: radius['2xl'],
    borderWidth: 1,
    borderColor: colors.border,
  },
});
