import React from 'react'
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { IndoorNavStep, IndoorManeuverType } from '../types/indoor'

interface Props {
  mode:                    'active' | 'arrived'
  currentStep:             IndoorNavStep | null
  upcomingStep:            IndoorNavStep | null
  distanceToNextManeuver:  number
  distanceToDestination:   number
  destinationName:         string
  currentFloor:            number
  isFloorTransitionPending: boolean
  onConfirmFloorTransition: () => void
  onEnd:                   () => void
  onSwitchToMap:           () => void
}

function formatDist(m: number): string {
  if (m < 1000) return `${Math.round(m)} м`
  return `${(m / 1000).toFixed(1)} км`
}

function maneuverIcon(type: IndoorManeuverType): string {
  switch (type) {
    case 'turn_left':                  return 'arrow-back'
    case 'turn_right':                 return 'arrow-forward'
    case 'u_turn':                     return 'return-up-back'
    case 'floor_transition_elevator':  return 'swap-vertical'
    case 'floor_transition_escalator': return 'trending-up'
    case 'floor_transition_stairs':    return 'footsteps'
    case 'arrive':                     return 'checkmark-circle'
    default:                           return 'arrow-up'
  }
}

export default function IndoorNavigationHUD({
  mode, currentStep, upcomingStep, distanceToNextManeuver,
  distanceToDestination, destinationName, currentFloor,
  isFloorTransitionPending, onConfirmFloorTransition, onEnd, onSwitchToMap,
}: Props) {

  if (mode === 'arrived') {
    return (
      <View style={styles.arrivedOverlay}>
        <View style={styles.arrivedCard}>
          <View style={styles.arrivedIcon}>
            <Ionicons name="checkmark-circle" size={52} color="#16a34a" />
          </View>
          <Text style={styles.arrivedTitle}>Хүрэх газартаа хүрлээ</Text>
          <Text style={styles.arrivedDest} numberOfLines={2}>{destinationName}</Text>
          <TouchableOpacity style={styles.arrivedBtn} onPress={onEnd}>
            <Text style={styles.arrivedBtnText}>Дуусгах</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const instruction = currentStep?.instruction_mn ?? 'Чиглэл тооцоолж байна...'
  const icon        = currentStep ? maneuverIcon(currentStep.maneuver_type) : 'arrow-up'

  return (
    <>
      {/* ── Top banner ── */}
      <View style={styles.topBanner}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon as any} size={26} color="#fff" />
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.instructionText} numberOfLines={2}>{instruction}</Text>
          {upcomingStep && (
            <Text style={styles.upcomingText} numberOfLines={1}>
              Дараа: {upcomingStep.instruction_mn}
            </Text>
          )}
        </View>
      </View>

      {/* ── Floor-transition confirmation banner ── */}
      {isFloorTransitionPending && (
        <View style={styles.floorBanner}>
          <Text style={styles.floorBannerText}>Давхар солигдсон уу?</Text>
          <TouchableOpacity style={styles.confirmBtn} onPress={onConfirmFloorTransition}>
            <Text style={styles.confirmBtnText}>Тийм</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Bottom sheet ── */}
      <View style={styles.bottomSheet}>
        <View style={styles.bottomRow}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricValue}>{formatDist(distanceToDestination)}</Text>
            <Text style={styles.metricLabel}>Үлдсэн зай</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBlock}>
            <Text style={styles.metricValue}>{currentFloor}-р давхар</Text>
            <Text style={styles.metricLabel}>Одоогийн байршил</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metricBlock}>
            <Text style={styles.metricValue}>{formatDist(distanceToNextManeuver)}</Text>
            <Text style={styles.metricLabel}>Дараагийн эргэлт</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.mapBtn} onPress={onSwitchToMap}>
            <Ionicons name="map-outline" size={18} color="#2563eb" />
            <Text style={styles.mapBtnText}>Зураг</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.endBtn} onPress={onEnd}>
            <Text style={styles.endBtnText}>Навигаци зогсоох</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  )
}

const TOP = Platform.OS === 'ios' ? 56 : 36
const BOTTOM_SAFE = Platform.OS === 'ios' ? 34 : 16

const styles = StyleSheet.create({
  // ── Top banner
  topBanner: {
    position: 'absolute',
    top: TOP,
    left: 16,
    right: 16,
    backgroundColor: '#1e40af',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerText: { flex: 1, gap: 2 },
  instructionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  upcomingText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  // ── Floor transition banner
  floorBanner: {
    position: 'absolute',
    top: TOP + 88,
    left: 16,
    right: 16,
    backgroundColor: '#7c3aed',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 6,
  },
  floorBannerText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  confirmBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Bottom sheet
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: BOTTOM_SAFE + 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 10,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  metricBlock: { flex: 1, alignItems: 'center' },
  metricValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  metricLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  metricDivider: { width: 1, height: 32, backgroundColor: '#e5e7eb' },
  actionRow: { flexDirection: 'row', gap: 10 },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  mapBtnText: { color: '#2563eb', fontWeight: '700', fontSize: 14 },
  endBtn: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  endBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // ── Arrived overlay
  arrivedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  arrivedCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    gap: 8,
  },
  arrivedIcon: { marginBottom: 4 },
  arrivedTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  arrivedDest: { fontSize: 15, color: '#6b7280', textAlign: 'center' },
  arrivedBtn: {
    marginTop: 16,
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
  },
  arrivedBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
