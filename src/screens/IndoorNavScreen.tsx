import React, { useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useIndoorNavigation } from '../hooks/useIndoorNavigation'
import { fetchVenueGraph } from '../hooks/useVenueDetection'
import type { AppStackParamList } from '../navigation'
import IndoorArOverlay from '../components/IndoorArOverlay'
import IndoorNavigationHUD from '../components/IndoorNavigationHUD'
import VenueIndoorMap from '../components/VenueIndoorMap'
import FloorSwitcher from '../components/FloorSwitcher'
import type { VenueGraph } from '../types/indoor'

type NavProp   = NativeStackNavigationProp<AppStackParamList>
type RouteProp_ = RouteProp<AppStackParamList, 'IndoorNav'>

export default function IndoorNavScreen() {
  const navigation = useNavigation<NavProp>()
  const route      = useRoute<RouteProp_>()
  const { venueId, destinationNodeId, destinationName, startFloor } = route.params

  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [showMap, setShowMap]   = useState(false)
  const [graph, setGraph]       = useState<VenueGraph | null>(null)
  const [loading, setLoading]   = useState(true)
  const indoorNav = useIndoorNavigation()
  const startedRef = useRef(false)

  // Load venue graph and start navigation
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      // Request camera permission in parallel with graph load
      const [, g] = await Promise.all([
        requestCameraPermission(),
        (async () => {
          // Fetch graph using a minimal venue stub — real venue data is in the graph
          const { data } = await import('../lib/supabase').then(m =>
            m.supabase.from('venues').select('*').eq('id', venueId).single()
          )
          if (!data) return null
          const venue = {
            id: data.id, place_id: data.place_id, name_mn: data.name_mn,
            name_en: data.name_en, address_mn: data.address_mn,
            lat: Number(data.lat), lng: Number(data.lng),
            floor_count: data.floor_count, default_floor: data.default_floor ?? startFloor,
            bbox: {
              sw: [Number(data.bbox_sw_lat), Number(data.bbox_sw_lng)] as [number, number],
              ne: [Number(data.bbox_ne_lat), Number(data.bbox_ne_lng)] as [number, number],
            },
          }
          return fetchVenueGraph(venue)
        })(),
      ])

      if (!g) {
        Alert.alert('Алдаа', 'Venue-н зураг ачааллахад алдаа гарлаа.')
        navigation.goBack()
        return
      }

      setGraph(g)
      await indoorNav.start(g, destinationNodeId)
      setLoading(false)
    })()

    return () => { indoorNav.stop() }
  }, [])  // intentionally empty — runs once on mount

  const handleEnd = () => {
    indoorNav.stop()
    navigation.goBack()
  }

  if (loading || !graph) {
    return (
      <View style={styles.loadingScreen}>
        <Text style={styles.loadingText}>Навигаци бэлдэж байна...</Text>
      </View>
    )
  }

  const cameraGranted = cameraPermission?.granted ?? false
  const useAR = cameraGranted && !showMap

  const heading        = indoorNav.heading ?? 0
  const bearing        = indoorNav.currentStep?.bearing ?? 0
  const distanceToNext = indoorNav.distanceToNextManeuver
  const maneuverType   = indoorNav.currentStep?.maneuver_type ?? 'straight'
  const isFloorTrans   = indoorNav.isFloorTransitionPending

  return (
    <View style={styles.container}>
      {/* ── Background: camera or 2D map ── */}
      {useAR ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" />
      ) : (
        <VenueIndoorMap
          graph={graph}
          currentFloor={indoorNav.currentFloor}
          steps={indoorNav.currentStep ? [indoorNav.currentStep, ...(indoorNav.upcomingStep ? [indoorNav.upcomingStep] : [])] : []}
          stepIndex={0}
          userPosition={indoorNav.userPositionOnFloor}
        />
      )}

      {/* ── AR arrow overlay (only in camera mode) ── */}
      {useAR && indoorNav.mode === 'active' && (
        <IndoorArOverlay
          bearingToTarget={bearing}
          deviceHeading={heading}
          distanceM={distanceToNext}
          maneuverType={maneuverType}
          isFloorTransition={isFloorTrans}
        />
      )}

      {/* ── Floor switcher ── */}
      <FloorSwitcher
        floors={graph.floors}
        currentFloor={indoorNav.currentFloor}
        onSelect={(floor) => {
          indoorNav.confirmFloorTransition()
        }}
      />

      {/* ── Camera / Map toggle (top-left) ── */}
      {cameraGranted && (
        <TouchableOpacity
          style={styles.toggleBtn}
          onPress={() => setShowMap(m => !m)}
          activeOpacity={0.8}
        >
          <Text style={styles.toggleBtnText}>{showMap ? '📷 AR' : '🗺 Зураг'}</Text>
        </TouchableOpacity>
      )}

      {/* ── HUD ── */}
      <IndoorNavigationHUD
        mode={indoorNav.mode === 'idle' ? 'active' : indoorNav.mode}
        currentStep={indoorNav.currentStep}
        upcomingStep={indoorNav.upcomingStep}
        distanceToNextManeuver={distanceToNext}
        distanceToDestination={indoorNav.distanceToDestination}
        destinationName={destinationName}
        currentFloor={indoorNav.currentFloor}
        isFloorTransitionPending={isFloorTrans}
        onConfirmFloorTransition={indoorNav.confirmFloorTransition}
        onEnd={handleEnd}
        onSwitchToMap={() => setShowMap(m => !m)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: '#fff', fontSize: 16 },
  toggleBtn: {
    position: 'absolute',
    top: 56,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 20,
  },
  toggleBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
