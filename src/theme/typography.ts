import { TextStyle } from 'react-native';
import { colors } from './colors';

export const typography = {
  display: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.8,
    color: colors.text,
  } satisfies TextStyle,
  h1: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    color: colors.text,
  } satisfies TextStyle,
  h2: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.4,
    color: colors.text,
  } satisfies TextStyle,
  body: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.text,
  } satisfies TextStyle,
  bodySm: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSec,
  } satisfies TextStyle,
  // Uppercase form label
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    color: colors.textSec,
  } satisfies TextStyle,
  // Section heading above a Card
  section: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.textMuted,
  } satisfies TextStyle,
  // Brand wordmark
  brand: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 2,
    color: colors.textMuted,
  } satisfies TextStyle,
  caption: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.textMuted,
  } satisfies TextStyle,
};
