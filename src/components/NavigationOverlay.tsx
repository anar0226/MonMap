import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  translateManeuver,
  maneuverIcon,
  formatDistanceMn,
  type NavStep,
} from '../lib/navigation';
import { formatDuration, formatDistance } from '../hooks/useDirections';
import { setMuted, isMuted, isMongolianAvailable } from '../lib/speech';

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  // Top banner — near-black like Apple Maps
  bannerBg:    '#1C1C1E',
  bannerText:  '#FFFFFF',
  bannerSub:   'rgba(255,255,255,0.75)',

  // Arrow icon area — vivid blue accent
  iconBg:      '#0077FF',

  // Bottom sheet — white, like Apple Maps
  sheetBg:     '#FFFFFF',
  sheetText:   '#000000',
  sheetLabel:  '#8E8E93',
  sheetEta:    '#000000',

  // Share ETA button text
  shareBlue:   '#007AFF',

  // End button
  endBg:       '#F2F2F7',
  endIcon:     '#8E8E93',

  // Side FABs
  fabBg:       'rgba(255,255,255,0.92)',
  fabShadow:   '#000',

  // Arrived card
  green:       '#34C759',
  arrivedCard: '#1C1C1E',
};

// ── Maneuver arrow SVG replacement ───────────────────────────────────────────
// We use Ionicons which maps well to Apple's turn arrow icons.
// maneuverIconApple returns the best matching Ionicons name.
function maneuverIconApple(m: NavStep['maneuver']): string {
  const mod = m.modifier ?? 'straight';
  switch (m.type) {
    case 'arrive':       return 'location';
    case 'depart':       return 'navigate';
    case 'board':        return 'bus';
    case 'alight':       return 'exit-outline';
    case 'roundabout':
    case 'rotary':
    case 'exit roundabout':
    case 'exit_roundabout':
      return 'git-merge-outline';
    case 'merge':        return 'git-merge-outline';
    case 'on_ramp':
    case 'on ramp':      return 'trending-up-outline';
    case 'off_ramp':
    case 'off ramp':     return 'trending-down-outline';
    case 'fork':
      return mod.includes('left') ? 'arrow-up-outline' : 'arrow-up-outline';
    case 'turn':
    case 'end of road':
    case 'end_of_road': {
      if (mod === 'uturn')           return 'return-down-back';
      if (mod.includes('sharp left')) return 'arrow-undo';
      if (mod.includes('sharp right'))return 'arrow-redo';
      if (mod.includes('left'))      return 'arrow-back';
      if (mod.includes('right'))     return 'arrow-forward';
      return 'arrow-up';
    }
    default:             return 'arrow-up';
  }
}

// Compute arrival wall-clock time (HH:MM) from now + durationRemainingSec
function arrivalTime(durationSec: number): string {
  const d = new Date(Date.now() + durationSec * 1000);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  mode: 'active' | 'arrived' | 'off_route' | 'rerouting';
  upcomingStep: NavStep | null;
  distanceToNextManeuver: number;
  distanceToDestination: number;
  durationRemainingSec: number;
  destinationName: string;
  onEnd: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NavigationOverlay({
  mode,
  upcomingStep,
  distanceToNextManeuver,
  distanceToDestination,
  durationRemainingSec,
  destinationName,
  onEnd,
}: Props) {
  const [muted, setMutedState] = useState(isMuted());

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  }, [muted]);

  // ── Arrived modal ──────────────────────────────────────────────────────────
  if (mode === 'arrived') {
    return (
      <View style={s.arrivedOverlay}>
        <View style={s.arrivedCard}>
          <View style={s.arrivedIconWrap}>
            <Ionicons name="checkmark-circle" size={60} color={C.green} />
          </View>
          <Text style={s.arrivedTitle}>Хүрэх газартаа хүрлээ</Text>
          <Text style={s.arrivedDest} numberOfLines={2}>{destinationName}</Text>
          <TouchableOpacity onPress={onEnd} activeOpacity={0.85} style={s.arrivedEndBtn}>
            <Text style={s.arrivedEndText}>Дуусгах</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Off-route banner ──────────────────────────────────────────────────────
  if (mode === 'off_route') {
    return (
      <View style={s.offRouteBanner}>
        <Ionicons name="warning-outline" size={22} color="#fff" />
        <Text style={s.offRouteText}>Маршрутаас гарлаа</Text>
        <TouchableOpacity onPress={onEnd} activeOpacity={0.85} style={s.offRouteEndBtn}>
          <Text style={s.offRouteEndText}>Дуусгах</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Rerouting banner ──────────────────────────────────────────────────────
  if (mode === 'rerouting') {
    return (
      <View style={s.reroutingBanner}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={s.reroutingText}>Шинэ замнал тооцоолж байна…</Text>
        <TouchableOpacity onPress={onEnd} activeOpacity={0.85} style={s.offRouteEndBtn}>
          <Text style={s.offRouteEndText}>Дуусгах</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Active navigation ──────────────────────────────────────────────────────
  const icon   = upcomingStep ? maneuverIconApple(upcomingStep.maneuver) : 'arrow-up';
  const dist   = formatDistanceMn(distanceToNextManeuver);
  const action = upcomingStep
    ? translateManeuver(upcomingStep.maneuver, upcomingStep.name)
    : 'Үргэлжлүүлнэ';

  const eta    = arrivalTime(durationRemainingSec);
  const mins   = formatDuration(durationRemainingSec);
  const km     = formatDistance(distanceToDestination);

  return (
    <>
      {/* ── Top instruction banner ─────────────────────────────────────── */}
      <View style={s.topBanner}>
        {/* Blue arrow icon box */}
        <View style={s.arrowBox}>
          <Ionicons name={icon as any} size={36} color="#fff" />
        </View>

        {/* Distance + instruction */}
        <View style={s.bannerTextWrap}>
          <Text style={s.bannerDist}>{dist}</Text>
          <Text style={s.bannerAction} numberOfLines={2}>{action}</Text>
        </View>
      </View>

      {/* ── Floating mute FAB ──────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={toggleMute}
        activeOpacity={0.8}
        style={s.muteFab}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={
            muted
              ? 'volume-mute'
              : isMongolianAvailable()
                ? 'volume-high'
                : 'volume-medium'
          }
          size={22}
          color={muted ? C.sheetLabel : C.shareBlue}
        />
      </TouchableOpacity>

      {/* ── Bottom ETA sheet ───────────────────────────────────────────── */}
      <View style={s.bottomSheet}>
        {/* Three stats */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{eta}</Text>
            <Text style={s.statLabel}>arrival</Text>
          </View>

          <View style={s.statDivider} />

          <View style={s.statItem}>
            <Text style={s.statValue}>{mins}</Text>
            <Text style={s.statLabel}>мин</Text>
          </View>

          <View style={s.statDivider} />

          <View style={s.statItem}>
            <Text style={s.statValue}>{km}</Text>
            <Text style={s.statLabel}>км</Text>
          </View>

          {/* End button — chevron up, like Apple Maps */}
          <TouchableOpacity onPress={onEnd} activeOpacity={0.75} style={s.endBtn}>
            <Ionicons name="close" size={18} color={C.endIcon} />
          </TouchableOpacity>
        </View>

        {/* Share ETA row */}
        <View style={s.shareRow}>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={s.shareEta}>Хүрэх цагийг хуваалцах</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const TOP = Platform.OS === 'ios' ? 56 : 36;
const BOTTOM = Platform.OS === 'ios' ? 34 : 16;
const SIDE = 14;

const s = StyleSheet.create({
  // ── Top banner ─────────────────────────────────────────────────────────────
  topBanner: {
    position: 'absolute',
    top: TOP,
    left: SIDE,
    right: SIDE,
    backgroundColor: C.bannerBg,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.40,
    shadowRadius: 14,
    elevation: 10,
  },
  arrowBox: {
    width: 80,
    alignSelf: 'stretch',
    backgroundColor: C.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  bannerTextWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  bannerDist: {
    fontSize: 28,
    fontWeight: '800',
    color: C.bannerText,
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  bannerAction: {
    fontSize: 14,
    fontWeight: '400',
    color: C.bannerSub,
    marginTop: 3,
    lineHeight: 19,
  },

  // ── Mute FAB ───────────────────────────────────────────────────────────────
  muteFab: {
    position: 'absolute',
    // Banner starts at TOP, roughly 100px tall on most devices.
    // Position this 110px below the safe-area top so it clears the banner.
    top: TOP + 108,
    right: SIDE,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.fabBg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.fabShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 5,
  },

  // ── Bottom sheet ───────────────────────────────────────────────────────────
  bottomSheet: {
    position: 'absolute',
    bottom: BOTTOM,
    left: SIDE,
    right: SIDE,
    backgroundColor: C.sheetBg,
    borderRadius: 18,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 10 : 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    gap: 0,
  },
  statItem: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: C.sheetEta,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  statLabel: {
    fontSize: 11,
    color: C.sheetLabel,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E5EA',
    marginHorizontal: 12,
  },
  endBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.endBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  shareRow: {
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    paddingTop: 10,
  },
  shareEta: {
    fontSize: 15,
    fontWeight: '500',
    color: C.shareBlue,
  },

  // ── Off-route banner ──────────────────────────────────────────────────────
  offRouteBanner: {
    position: 'absolute',
    top: TOP,
    left: SIDE,
    right: SIDE,
    backgroundColor: '#FF9500',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 10,
  },
  offRouteText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  offRouteEndBtn: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  offRouteEndText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },

  // ── Rerouting banner ──────────────────────────────────────────────────────
  reroutingBanner: {
    position: 'absolute',
    top: TOP,
    left: SIDE,
    right: SIDE,
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.30,
    shadowRadius: 14,
    elevation: 10,
  },
  reroutingText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },

  // ── Arrived modal ──────────────────────────────────────────────────────────
  arrivedOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.50)',
    paddingHorizontal: 24,
  },
  arrivedCard: {
    backgroundColor: C.arrivedCard,
    borderRadius: 22,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  arrivedIconWrap: {
    marginBottom: 14,
  },
  arrivedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  arrivedDest: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  arrivedEndBtn: {
    backgroundColor: C.iconBg,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  arrivedEndText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
