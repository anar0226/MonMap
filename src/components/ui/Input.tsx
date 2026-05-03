import React, { ReactNode, useState, forwardRef } from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius } from '../../theme';

export type InputProps = TextInputProps & {
  trailing?: ReactNode;
  containerStyle?: ViewStyle;
  invalid?: boolean;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { trailing, containerStyle, invalid, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrap,
        focused && styles.focused,
        invalid && styles.invalid,
        containerStyle,
      ]}
    >
      <TextInput
        ref={ref}
        style={styles.input}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />
      {trailing}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  focused: { borderColor: colors.primary },
  invalid: { borderColor: colors.danger },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
});
