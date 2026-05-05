export { colors } from './colors';
export type { ColorToken } from './colors';
export { gradients } from './gradients';
export type { GradientToken } from './gradients';
export { spacing } from './spacing';
export type { SpacingToken } from './spacing';
export { radius } from './radius';
export type { RadiusToken } from './radius';
export { typography } from './typography';
export { shadows } from './shadows';
export type { ShadowToken } from './shadows';

// Convenience aliases — screens import these bare names (not gradients.xxx).
import { gradients } from './gradients';
export const gradientBg = gradients.bg;
export const gradientPrimary = gradients.primary;
export const gradientCard = gradients.card;
