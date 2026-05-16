import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { EarningsSnapshot } from '../hooks/useNavigation';

interface Props {
  earnings: EarningsSnapshot;
}

/**
 * Floating chip shown during navigation. States:
 *   - hidden                : no active trip
 *   - "+₮20/min" pulsing    : currently earning
 *   - "₮X earned"           : trip active but not currently earning (free flow)
 *   - "Daily limit reached" : daily cap hit
 */
export function EarningsBadge({ earnings }: Props) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!earnings.isEarningNow) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [earnings.isEarningNow, pulse]);

  if (!earnings.tripId) return null;

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });

  let bg = colors.cardBg;
  let icon: keyof typeof Ionicons.glyphMap = 'wallet-outline';
  let label = `₮${earnings.earnedMnt.toLocaleString()}`;
  let sub: string | null = null;

  if (earnings.dailyCapReached) {
    bg   = colors.warning;
    icon = 'lock-closed-outline';
    sub  = 'Өдрийн дээд хязгаар';
  } else if (earnings.isEarningNow) {
    bg   = colors.success;
    icon = 'trending-up';
    sub  = '+₮20/мин';
  } else {
    sub = 'Идэвхтэй аялал';
  }

  return (
    <Animated.View
      style={[
        styles.wrap,
        { backgroundColor: bg, transform: [{ scale }] },
      ]}
    >
      <Ionicons name={icon} size={16} color={colors.textInverse} />
      <View>
        <Text style={[styles.amount, { color: colors.textInverse }]}>{label}</Text>
        {sub && <Text style={[styles.sub, { color: colors.textInverse }]}>{sub}</Text>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  amount: { fontSize: 14, fontWeight: '700' },
  sub:    { fontSize: 10, opacity: 0.85 },
});
