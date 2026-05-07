export const colors = {
  primary: '#0053A3',
  primaryDark: '#1A3FA8',
  accent: '#4F46E5',

  bg: '#090C16',
  bgElevated: '#0D1220',
  cardBg: '#111520',
  inputBg: 'rgba(255,255,255,0.06)',

  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.18)',

  text: '#FFFFFF',
  textSec: 'rgba(255,255,255,0.70)',
  textMuted: 'rgba(255,255,255,0.50)',
  textInverse: '#090C16',

  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',

  purple: '#8B5CF6',
  sky: '#0EA5E9',
  indigo: '#6366F1',
  star: '#FBB824',

  scrimLight: 'rgba(255,255,255,0.05)',
  scrimDanger: 'rgba(239,68,68,0.10)',
  scrimDangerBorder: 'rgba(239,68,68,0.20)',
} as const;

export type ColorToken = keyof typeof colors;
