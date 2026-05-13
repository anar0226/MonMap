// Skeleton loaders for React Native.
//
// Two primitives:
//   <Skeleton>             — a single shimmering rectangle (text line, image,
//                            avatar). Width/height defaulted to a text line.
//   <SkeletonCard>         — a card-shaped wrapper that draws a row matching
//                            the layout BookingsScreen / SearchScreen use.
//
// The shimmer is a single Animated.Value driving opacity between 0.4 and 1.0
// on a 1.2-second loop. We avoid LinearGradient-based shimmer because the
// useNativeDriver opacity loop costs ~0 on the JS thread and animates on
// the UI thread, so 20+ skeletons on screen are still 60 fps.
//
// Theme-aware: the skeleton color comes from `colors.inputBg` and the card
// chrome from `colors.cardBg` + `colors.border`, so light/dark just works.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface SkeletonProps {
  width?:  ViewStyle['width'];
  height?: ViewStyle['height'];
  /** Override the corner radius. Defaults to 6 (matches text shape). */
  radius?: number;
  /** Extra style to merge — useful for `marginTop`, `alignSelf`, etc. */
  style?:  ViewStyle | ViewStyle[];
}

export function Skeleton({ width = '100%', height = 14, radius = 6, style }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Loop opacity between 0.4 and 1 every 1.2s. Native driver = UI thread,
    // no React re-renders, no JS bridge traffic.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.inputBg, opacity },
        style,
      ]}
    />
  );
}

/**
 * Booking-row-shaped skeleton — matches the BookingsScreen card layout so the
 * transition from loading → data has no layout shift.
 */
export function SkeletonBookingCard() {
  const { colors } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
      <View style={s.cardHeader}>
        <Skeleton width={32} height={32} radius={9} />
        <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="40%" height={11} />
        </View>
        <Skeleton width={64} height={20} radius={10} />
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
        <Skeleton width={80} height={11} />
        <Skeleton width={64} height={11} />
      </View>
    </View>
  );
}

/**
 * Search-result-shaped skeleton — matches the SearchScreen row layout
 * (avatar + 2-line text + chevron).
 */
export function SkeletonSearchRow() {
  return (
    <View style={s.searchRow}>
      <Skeleton width={40} height={40} radius={20} />
      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="80%" height={11} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
