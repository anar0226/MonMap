import React, { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { colors, spacing } from '../../theme';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  keyboard?: boolean;
  edges?: Edge[];
  contentStyle?: ViewStyle;
  bg?: string;
  padding?: number;
};

export function Screen({
  children,
  scroll = false,
  keyboard = false,
  edges = ['top', 'bottom'],
  contentStyle,
  bg = colors.bg,
  padding = spacing['2xl'],
}: Props) {
  const padStyle: ViewStyle = { paddingHorizontal: padding };

  let body: ReactNode = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, padStyle, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padStyle, contentStyle]}>{children}</View>
  );

  if (keyboard) {
    body = (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: bg }]} edges={edges}>
      {body}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: spacing['2xl'] },
});
