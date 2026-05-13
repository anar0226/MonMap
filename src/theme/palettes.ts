// Light + dark palettes.
//
// The historical `colors` export in ./colors.ts is the dark palette and remains
// importable for screens that haven't been migrated yet — so adding light mode
// is purely additive: nothing breaks if a screen stays on the static import.
//
// Screens that want to respond to the user's theme choice should switch from
// `import { colors } from '../../theme'` to `const { colors } = useTheme()`
// inside the component body. StyleSheet definitions then move inside the
// component (or wrap with useMemo) so they recompute when theme changes.
//
// Tokens are deliberately the same shape between light and dark — same keys,
// different values — so migrating a screen is a mechanical refactor with no
// risk of typo'd token names breaking only one mode.

import { colors as darkColors } from './colors';

export type Palette = typeof darkColors;

export const palettes: { dark: Palette; light: Palette } = {
  dark: darkColors,

  light: {
    primary:     '#1a56db',
    primaryDark: '#1240a6',
    accent:      '#4F46E5',

    bg:          '#F8FAFC',
    bgElevated:  '#FFFFFF',
    cardBg:      '#FFFFFF',
    inputBg:     'rgba(15,23,42,0.04)',

    border:       'rgba(15,23,42,0.10)',
    borderStrong: 'rgba(15,23,42,0.18)',

    text:        '#0F172A',
    textSec:     'rgba(15,23,42,0.65)',
    textMuted:   'rgba(15,23,42,0.45)',
    textInverse: '#FFFFFF',

    success: '#059669',
    warning: '#D97706',
    danger:  '#DC2626',

    purple: '#7C3AED',
    sky:    '#0284C7',
    indigo: '#4F46E5',
    star:   '#D97706',

    scrimLight:        'rgba(15,23,42,0.04)',
    scrimDanger:       'rgba(220,38,38,0.08)',
    scrimDangerBorder: 'rgba(220,38,38,0.20)',
  },
};

export type ThemeName = keyof typeof palettes;
