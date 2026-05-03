import { ViewStyle } from 'react-native';
import { colors } from './colors';

export const shadows = {
  none: {} as ViewStyle,
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  } satisfies ViewStyle,
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  } satisfies ViewStyle,
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 10,
  } satisfies ViewStyle,
  // Brand glow under primary buttons / logos
  glowPrimary: {
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.33,
    shadowRadius: 16,
    elevation: 0,
  } satisfies ViewStyle,
};

export type ShadowToken = keyof typeof shadows;
