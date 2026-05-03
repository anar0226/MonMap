import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppLogo, Button, Screen } from '../../components/ui';
import { colors, spacing } from '../../theme';

interface Props {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function WelcomeScreen({ onSignIn, onSignUp }: Props) {
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={s.hero}>
        <AppLogo size="lg" />
        <Text style={s.title}>MonMap</Text>
        <Text style={s.tagline}>Улаанбаатарын газрын зураг</Text>
      </View>

      <View style={s.actions}>
        <Button label="Нэвтрэх" onPress={onSignIn} />
        <Button label="Бүртгүүлэх" variant="secondary" onPress={onSignUp} style={s.secondBtn} />
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing['2xl'],
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.5,
    marginTop: -spacing.md,
  },
  tagline: {
    fontSize: 15,
    color: colors.textSec,
    marginTop: -spacing.md,
  },
  actions: {
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  secondBtn: {
    marginTop: 0,
  },
});
