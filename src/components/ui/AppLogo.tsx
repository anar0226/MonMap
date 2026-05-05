import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from '../../theme';

type Size = 'sm' | 'md' | 'lg' | 'xl';

type Variant = 'dark' | 'light' | 'blue' | 'mono';

type Props = {
  size?: Size | number;
  style?: ViewStyle;
  variant?: Variant;
  showWordmark?: boolean;
  /** Render with rounded square background (app icon style) */
  iconBg?: boolean;
};

const SIZE_PX: Record<Size, number> = {
  sm: 28,
  md: 40,
  lg: 64,
  xl: 96,
};

type Scheme = {
  markColor: string;
  wordColor: string;
  iconBg: string;
  iconMark: string;
};

const SCHEMES: Record<Variant, Scheme> = {
  dark: {
    markColor: colors.primary,
    wordColor: 'rgba(255,255,255,0.92)',
    iconBg: colors.primary,
    iconMark: '#ffffff',
  },
  light: {
    markColor: colors.primary,
    wordColor: '#0d1117',
    iconBg: colors.primary,
    iconMark: '#ffffff',
  },
  blue: {
    markColor: '#ffffff',
    wordColor: '#ffffff',
    iconBg: colors.primary,
    iconMark: '#ffffff',
  },
  mono: {
    markColor: '#ffffff',
    wordColor: '#ffffff',
    iconBg: '#0d1117',
    iconMark: '#ffffff',
  },
};

/**
 * Map-pin mark whose teardrop body is a contour ring.
 * Geometry derived from a 72-unit base.
 */
export function LogoMark({
  size = 64,
  color = colors.primary,
  bg = 'transparent',
}: {
  size?: number;
  color?: string;
  bg?: string;
}) {
  const s = size;
  const scale = s / 72;
  const cx = 36 * scale;
  const cy = 30 * scale;
  const outerR = 22 * scale;
  const innerR = 7 * scale;
  const tailY = 66 * scale;
  const tailHalfW = 6 * scale;
  const contourR = 14 * scale;

  const tailPath =
    `M ${cx - tailHalfW} ${cy + outerR * 0.6}` +
    ` Q ${cx - outerR * 0.8} ${cy + outerR * 1.4} ${cx} ${tailY}` +
    ` Q ${cx + outerR * 0.8} ${cy + outerR * 1.4} ${cx + tailHalfW} ${cy + outerR * 0.6}` +
    ` A ${outerR} ${outerR} 0 0 0 ${cx - tailHalfW} ${cy + outerR * 0.6} Z`;

  const dash = contourR * Math.PI * 1.4;
  const gap = contourR * Math.PI * 0.6;
  const offset = -contourR * Math.PI * 0.15;

  return (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      {bg !== 'transparent' && (
        <Rect width={s} height={s} rx={s * 0.22} fill={bg} />
      )}
      <Circle cx={cx} cy={cy} r={outerR} fill={color} />
      <Path d={tailPath} fill={color} />
      <Circle
        cx={cx}
        cy={cy}
        r={contourR}
        stroke="white"
        strokeWidth={1.6 * scale}
        strokeOpacity={0.35}
        strokeDasharray={`${dash}, ${gap}`}
        strokeDashoffset={offset}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={cx} cy={cy} r={innerR} fill="white" />
    </Svg>
  );
}

export function AppLogo({
  size = 'md',
  style,
  variant = 'dark',
  showWordmark = false,
  iconBg = false,
}: Props) {
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  const scheme = SCHEMES[variant];

  const markColor = iconBg ? scheme.iconMark : scheme.markColor;
  const markBg = iconBg ? scheme.iconBg : 'transparent';

  if (!showWordmark) {
    return (
      <View style={style}>
        <LogoMark size={px} color={markColor} bg={markBg} />
      </View>
    );
  }

  const fontSize = px * 0.44;
  return (
    <View style={[styles.row, { gap: px * 0.18 }, style]}>
      <LogoMark size={px} color={markColor} bg={markBg} />
      <Text style={[styles.word, { fontSize, color: scheme.wordColor }]}>
        Mon<Text style={styles.wordLight}>Map</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  word: {
    fontWeight: '700',
    letterSpacing: -0.6,
    lineHeight: undefined,
    includeFontPadding: false,
  },
  wordLight: {
    fontWeight: '300',
  },
});
