import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { typography } from '../../theme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
};

export function Label({ children, style }: Props) {
  return (
    <Text style={[typography.label, style]}>
      {typeof children === 'string' ? children.toUpperCase() : children}
    </Text>
  );
}
