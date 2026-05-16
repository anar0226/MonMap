import React, { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import Svg, { Path, Circle } from 'react-native-svg'
import type { IndoorManeuverType } from '../types/indoor'

interface Props {
  bearingToTarget: number   // degrees 0=north (direction toward next node)
  deviceHeading:   number   // degrees 0=north (where phone points)
  distanceM:       number
  maneuverType:    IndoorManeuverType
  isFloorTransition: boolean
}

const ARROW_SIZE = 120

// Arrow rotation = where target is relative to camera view
function relativeAngle(bearing: number, heading: number): number {
  return ((bearing - heading) + 360) % 360
}

function formatDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} м`
  return `${(m / 1000).toFixed(1)} км`
}

const FLOOR_ICONS: Partial<Record<IndoorManeuverType, string>> = {
  floor_transition_elevator:  '🛗',
  floor_transition_escalator: '↕',
  floor_transition_stairs:    '🪜',
}

export default function IndoorArOverlay({ bearingToTarget, deviceHeading, distanceM, maneuverType, isFloorTransition }: Props) {
  const rotation = useRef(new Animated.Value(0)).current
  const prevAngle = useRef(relativeAngle(bearingToTarget, deviceHeading))

  useEffect(() => {
    const target = relativeAngle(bearingToTarget, deviceHeading)

    // Shortest-path rotation to avoid spinning 350° the wrong way
    let delta = target - prevAngle.current
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    const next = prevAngle.current + delta
    prevAngle.current = next

    Animated.spring(rotation, {
      toValue: next,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start()
  }, [bearingToTarget, deviceHeading])

  const rotate = rotation.interpolate({
    inputRange:  [0, 360],
    outputRange: ['0deg', '360deg'],
  })

  if (isFloorTransition) {
    const icon = FLOOR_ICONS[maneuverType] ?? '↕'
    return (
      <View style={styles.container} pointerEvents="none">
        <View style={styles.floorTransitionBox}>
          <Text style={styles.floorIcon}>{icon}</Text>
          <Text style={styles.floorLabel}>{formatDist(distanceM)}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Pulsing ring */}
      <View style={styles.pulseRing} />

      {/* Rotating arrow */}
      <Animated.View style={[styles.arrowWrap, { transform: [{ rotate }] }]}>
        <Svg width={ARROW_SIZE} height={ARROW_SIZE} viewBox="0 0 100 100">
          {/* Shadow circle */}
          <Circle cx="50" cy="50" r="46" fill="rgba(0,0,0,0.25)" />
          {/* White fill circle */}
          <Circle cx="50" cy="50" r="44" fill="white" />
          {/* Blue arrow pointing up (north) */}
          <Path
            d="M50 15 L65 62 L50 52 L35 62 Z"
            fill="#2563EB"
          />
        </Svg>
      </Animated.View>

      {/* Distance label */}
      <View style={styles.distanceBadge}>
        <Text style={styles.distanceText}>{formatDist(distanceM)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: ARROW_SIZE + 24,
    height: ARROW_SIZE + 24,
    borderRadius: (ARROW_SIZE + 24) / 2,
    borderWidth: 2,
    borderColor: 'rgba(37,99,235,0.35)',
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  arrowWrap: {
    width: ARROW_SIZE,
    height: ARROW_SIZE,
  },
  distanceBadge: {
    position: 'absolute',
    bottom: '28%',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  distanceText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  floorTransitionBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 36,
    gap: 8,
  },
  floorIcon: { fontSize: 52 },
  floorLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
})
