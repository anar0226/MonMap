import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from 'react-native';
import { colors, radius } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

const VARIANTS: Record<Variant, { bg: ViewStyle; disabled: ViewStyle; label: TextStyle }> = {
  primary: {
    bg: { backgroundColor: colors.primary },
    disabled: { backgroundColor: 'rgba(0,83,163,0.40)' },
    label: { color: '#fff' },
  },
  secondary: {
    bg: {
      backgroundColor: colors.cardBg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    disabled: { opacity: 0.5 },
    label: { color: colors.text },
  },
  danger: {
    bg: {
      backgroundColor: colors.scrimDanger,
      borderWidth: 1,
      borderColor: colors.scrimDangerBorder,
    },
    disabled: { opacity: 0.5 },
    label: { color: colors.danger },
  },
  ghost: {
    bg: { backgroundColor: 'transparent' },
    disabled: { opacity: 0.5 },
    label: { color: colors.text },
  },
};

const SIZES: Record<Size, ViewStyle> = {
  md: { paddingVertical: 12, minHeight: 44 },
  lg: { paddingVertical: 15, minHeight: 50 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  style,
}: Props) {
  const isDisabled = disabled || loading;
  const v = VARIANTS[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        SIZES[size],
        v.bg,
        isDisabled && v.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.label.color as string} />
      ) : (
        <Text style={[styles.label, v.label]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  label: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
