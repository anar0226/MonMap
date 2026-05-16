import React, { useMemo } from 'react'
import { Image, StyleSheet, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'
import type { VenueGraph, IndoorNavStep } from '../types/indoor'

interface Props {
  graph:          VenueGraph
  currentFloor:   number
  steps:          IndoorNavStep[]
  stepIndex:      number
  userPosition:   { x: number; y: number } | null  // normalised 0..1
}

export default function VenueIndoorMap({ graph, currentFloor, steps, stepIndex, userPosition }: Props) {
  const floor = graph.floors.find(f => f.floor_number === currentFloor)

  // Nodes and route path for the current floor
  const { routePoints, currentNodePos } = useMemo(() => {
    const floorNodes = [...graph.nodes.values()].filter(n => n.floor_number === currentFloor)
    const fl = graph.floors.find(f => f.floor_number === currentFloor)
    if (!fl?.anchor_lat || !fl.plan_width_m || !fl.plan_height_m) {
      return { routePoints: [], currentNodePos: null }
    }

    function toNorm(lat: number, lng: number): { x: number; y: number } {
      const metersPerLat = 111_111
      const metersPerLng = 111_111 * Math.cos((fl!.anchor_lat as number) * (Math.PI / 180))
      const rad = -(fl!.anchor_rotation_deg ?? 0) * (Math.PI / 180)
      const dLatM = (lat - (fl!.anchor_lat as number)) * metersPerLat
      const dLngM = (lng - (fl!.anchor_lng as number)) * metersPerLng
      const xM = dLngM * Math.cos(rad) - dLatM * Math.sin(rad)
      const yM = dLngM * Math.sin(rad) + dLatM * Math.cos(rad)
      return {
        x: Math.max(0, Math.min(1, xM / (fl!.plan_width_m as number))),
        y: Math.max(0, Math.min(1, yM / (fl!.plan_height_m as number))),
      }
    }

    // Route path: steps on this floor
    const pts = steps
      .slice(stepIndex)
      .filter(s => s.node.floor_number === currentFloor)
      .map(s => toNorm(s.node.lat, s.node.lng))

    const cur = steps[stepIndex]?.node?.floor_number === currentFloor
      ? toNorm(steps[stepIndex].node.lat, steps[stepIndex].node.lng)
      : null

    return { routePoints: pts, currentNodePos: cur }
  }, [graph, currentFloor, steps, stepIndex])

  return (
    <View style={styles.container}>
      {floor?.plan_svg_url ? (
        <Image source={{ uri: floor.plan_svg_url }} style={styles.planImage} resizeMode="contain" />
      ) : (
        <View style={styles.planPlaceholder} />
      )}

      {/* Route overlay */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 1 1" preserveAspectRatio="none">
        {/* Route lines */}
        {routePoints.slice(0, -1).map((pt, i) => {
          const next = routePoints[i + 1]
          return (
            <Line
              key={i}
              x1={pt.x}   y1={pt.y}
              x2={next.x} y2={next.y}
              stroke="#2563eb"
              strokeWidth="0.008"
              strokeDasharray="0.02,0.01"
            />
          )
        })}
        {/* Next maneuver node */}
        {currentNodePos && (
          <Circle cx={currentNodePos.x} cy={currentNodePos.y} r="0.015" fill="#2563eb" />
        )}
        {/* User position dot */}
        {userPosition && (
          <>
            <Circle cx={userPosition.x} cy={userPosition.y} r="0.025" fill="rgba(37,99,235,0.15)" />
            <Circle cx={userPosition.x} cy={userPosition.y} r="0.014" fill="#2563eb" stroke="#fff" strokeWidth="0.006" />
          </>
        )}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    position: 'relative',
  },
  planImage: {
    ...StyleSheet.absoluteFillObject,
  },
  planPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#e5e7eb',
  },
})
