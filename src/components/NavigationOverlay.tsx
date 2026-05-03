import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  translateManeuver,
  maneuverIcon,
  formatDistanceMn,
  type NavStep,
} from '../lib/navigation';
import { formatDuration, formatDistance } from '../hooks/useDirections';
import { setMuted, isMuted, isMongolianAvailable } from '../lib/speech';

const C = {
  bg:        '#0B1220',
  panel:     '#111520',
  border:    'rgba(255,255,255,0.10)',
  text:      'rgba(255,255,255,0.98)',
  textSec:   'rgba(255,255,255,0.65)',
  textMuted: 'rgba(255,255,255,0.40)',
  primary:   '#0053A3',
  primaryLt: '#1a6fc4',
  green:     '#10B981',
  amber:     '#FBB824',
  red:       '#EF4444',
};

interface Props {
  mode: 'active' | 'arrived';
  upcomingStep: NavStep | null;
  distanceToNextManeuver: number;
  distanceToDestination: number;
  durationRemainingSec: number;
  destinationName: string;
  onEnd: () => void;
}

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

  if (mode === 'arrived') {
    return (
      <View style={s.arrivedWrap}>
        <View style={s.arrivedCard}>
          <View style={s.arrivedIcon}>
            <Ionicons name="checkmark-circle" size={56} color={C.green} />
          </View>
          <Text style={s.arrivedTitle}>Хүрэх газартаа хүрлээ</Text>
          <Text style={s.arrivedDest} numberOfLines={2}>{destinationName}</Text>
          <TouchableOpacity onPress={onEnd} activeOpacity={0.85} style={s.endBtnFull}>
            <Text style={s.endBtnFullText}>Дуусгах</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const action = upcomingStep
    ? translateManeuver(upcomingStep.maneuver, upcomingStep.name)
    : 'Үргэлжлүүлнэ';
  const icon = upcomingStep ? maneuverIcon(upcomingStep.maneuver) : 'arrow-up';
  const distLabel = formatDistanceMn(distanceToNextManeuver);

  return (
    <>
      {/* Top instruction banner */}
      <View style={s.topBanner}>
        <View style={s.iconCircle}>
          <Ionicons name={icon as any} size={32} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.distance}>{distLabel}</Text>
          <Text style={s.action} numberOfLines={2}>{action}</Text>
        </View>
        <TouchableOpacity onPress={toggleMute} style={s.muteBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons
            name={muted ? 'volume-mute' : (isMongolianAvailable() ? 'volume-high' : 'volume-low-outline')}
            size={20}
            color={muted ? C.textMuted : C.textSec}
          />
        </TouchableOpacity>
      </View>

      {/* Bottom ETA bar */}
      <View style={s.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={s.etaTime}>{formatDuration(durationRemainingSec)}</Text>
          <Text style={s.etaSub}>
            {formatDistance(distanceToDestination)} · {destinationName}
          </Text>
        </View>
        <TouchableOpacity onPress={onEnd} activeOpacity={0.85} style={s.endBtn}>
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  topBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 12,
    right: 12,
    backgroundColor: C.primary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  distance: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  action: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    lineHeight: 17,
  },
  muteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },

  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 28 : 16,
    left: 12,
    right: 12,
    backgroundColor: C.panel,
    borderRadius: 16,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  etaTime: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.4,
  },
  etaSub: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 1,
  },
  endBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },

  arrivedWrap: {
    position: 'absolute',
    inset: 0 as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 24,
  },
  arrivedCard: {
    backgroundColor: C.panel,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  arrivedIcon: {
    marginBottom: 12,
  },
  arrivedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  arrivedDest: {
    fontSize: 14,
    color: C.textSec,
    textAlign: 'center',
    marginBottom: 20,
  },
  endBtnFull: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  endBtnFullText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
