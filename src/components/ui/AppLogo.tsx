import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, shadows } from '../../theme';

type Size = 'sm' | 'md' | 'lg';

type Props = {
  size?: Size;
  style?: ViewStyle;
  glow?: boolean;
};

const SIZES: Record<Size, { box: number; radius: number; font: number }> = {
  sm: { box: 34, radius: radius.md, font: 14 },
  md: { box: 48, radius: radius.xl, font: 20 },
  lg: { box: 64, radius: radius['2xl'], font: 28 },
};

export function AppLogo({ size = 'md', style, glow = true }: Props) {
  const s = SIZES[size];
  return (
    <View
      style={[
        styles.box,
        { width: s.box, height: s.box, borderRadius: s.radius },
        glow && shadows.glowPrimary,
        style,
      ]}
    >
      <Text style={[styles.letter, { fontSize: s.font }]}>M</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: -0.4,
  },
});
