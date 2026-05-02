import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration, formatDistance, type RouteResult } from '../hooks/useDirections';

const C = {
  bg:        '#111520',
  border:    'rgba(255,255,255,0.10)',
  text:      'rgba(255,255,255,0.95)',
  textSec:   'rgba(255,255,255,0.55)',
  textMuted: 'rgba(255,255,255,0.35)',
  primary:   '#0053A3',
  primaryLt: '#1a6fc4',
  green:     '#10B981',
  amber:     '#FBB824',
  orange:    '#F59E0B',
  red:       '#EF4444',
};

interface Props {
  route: RouteResult | null;
  loading: boolean;
  error: string | null;
  destinationName: string | null;
  onClose: () => void;
}

function trafficLabel(route: RouteResult): { color: string; label: string } {
  const counts: Record<string, number> = {};
  for (const f of route.segments.features) {
    const c = f.properties.congestion;
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const total = route.segments.features.length || 1;
  const heavy = (counts.heavy ?? 0) + (counts.severe ?? 0);
  const moderate = counts.moderate ?? 0;
  if (heavy / total > 0.25) return { color: C.red,   label: 'Хүнд түгжрэл' };
  if ((heavy + moderate) / total > 0.30) return { color: C.orange, label: 'Дунд зэрэг түгжрэлтэй' };
  return { color: C.green, label: 'Хөдөлгөөн чөлөөтэй' };
}

export function DirectionsPanel({ route, loading, error, destinationName, onClose }: Props) {
  if (!loading && !route && !error) return null;

  return (
    <View style={s.panel}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>ЧИГЛЭЛ</Text>
          {destinationName && (
            <Text style={s.dest} numberOfLines={1}>{destinationName}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={s.closeBtn}>
          <Ionicons name="close" size={18} color={C.textSec} />
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={[s.row, { marginTop: 10, gap: 10 }]}>
          <ActivityIndicator size="small" color={C.primaryLt} />
          <Text style={s.loadingText}>Маршрут тооцоолж байна…</Text>
        </View>
      )}

      {error && !loading && (
        <Text style={s.errorText}>{error}</Text>
      )}

      {route && !loading && (() => {
        const traffic = trafficLabel(route);
        const typical = route.summary.durationTypicalSeconds;
        const delaySec = typical != null ? route.summary.durationSeconds - typical : 0;
        return (
          <View style={{ marginTop: 8 }}>
            <View style={s.row}>
              <Text style={s.eta}>{formatDuration(route.summary.durationSeconds)}</Text>
              <Text style={s.dist}>· {formatDistance(route.summary.distanceMeters)}</Text>
            </View>
            <View style={[s.row, { marginTop: 6, gap: 6 }]}>
              <View style={[s.dot, { backgroundColor: traffic.color }]} />
              <Text style={[s.trafficText, { color: traffic.color }]}>{traffic.label}</Text>
              {delaySec > 60 && (
                <Text style={s.delayText}>+{formatDuration(delaySec)} түгжрэлээс</Text>
              )}
            </View>
          </View>
        );
      })()}
    </View>
  );
}

const s = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 90,
    left: 12,
    right: 12,
    backgroundColor: C.bg,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 1,
    fontWeight: '600',
  },
  dest: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    marginTop: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: C.textSec,
    fontSize: 13,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    marginTop: 8,
  },
  eta: {
    fontSize: 22,
    fontWeight: '700',
    color: C.primaryLt,
    letterSpacing: -0.5,
  },
  dist: {
    fontSize: 14,
    color: C.textSec,
    marginLeft: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trafficText: {
    fontSize: 12,
    fontWeight: '600',
  },
  delayText: {
    fontSize: 11,
    color: C.textMuted,
    marginLeft: 4,
  },
});
