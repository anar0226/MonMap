import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppLogo, Button, Screen } from '../../components/ui';
import { spacing } from '../../theme';
import { useTheme } from '../../context/ThemeContext';

interface Props {
  onSignIn: () => void;
  onSignUp: () => void;
}

export function WelcomeScreen({ onSignIn, onSignUp }: Props) {
  const { colors, theme } = useTheme();
  const s = React.useMemo(() => makeStyles(colors), [colors]);
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={s.hero}>
        <AppLogo size="xl" showWordmark variant={theme === 'dark' ? 'dark' : 'light'} />
        <Text style={s.tagline}>Улаанбаатарын газрын зураг</Text>
      </View>

      <View style={s.actions}>
        <Button label="Нэвтрэх" onPress={onSignIn} />
        <Button label="Бүртгүүлэх" variant="secondary" onPress={onSignUp} style={s.secondBtn} />
      </View>
    </Screen>
  );
}

type Colors = ReturnType<typeof useTheme>['colors'];
function makeStyles(colors: Colors) {
  return StyleSheet.create({
    hero: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing['2xl'],
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
}
