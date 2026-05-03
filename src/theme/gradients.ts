// Gradient color tuples — pass to <LinearGradient colors={...}> from `expo-linear-gradient`.
// Install with: npx expo install expo-linear-gradient
export const gradients = {
  bg: ['#0C0E1A', '#0A1628', '#0D0A1F'] as const,
  card: ['#090C18', '#0A1630', '#0D0B20'] as const,
  primary: ['#0053A3', '#1A3FA8'] as const,
  primaryMuted: ['rgba(0,83,163,0.5)', 'rgba(26,63,168,0.5)'] as const,
  primaryDisabled: ['rgba(0,83,163,0.38)', 'rgba(26,63,168,0.38)'] as const,
} as const;

export type GradientToken = keyof typeof gradients;
