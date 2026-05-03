import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  formatDuration,
  formatDistance,
  type ModeRoute,
  type MultiRoute,
} from '../hooks/useDirections';
import { MODES, MODE_BY_KEY, type TransportMode } from '../lib/transport';

const C = {
  bg:        '#111520',
  bgAlt:     '#1a1f2e',
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
  multi: MultiRoute | null;
  loading: boolean;
  error: string | null;
  destinationName: string | null;
  onClose: () => void;
  onStart: () => void;
  onSelectMode: (m: TransportMode) => void;
}

function trafficLabel(route: ModeRoute): { color: string; label: string } | null {
  if (route.mode !== 'driving' && route.mode !== 'ubcab' && route.mode !== 'aba') return null;
  const counts: Record<string, number> = {};
  for (const f of route.segments.features) {
    const c = f.properties.congestion;
    counts[c] = (counts[c] ?? 0) + 1;
  }
  const total = route.segments.features.length || 1;
  const heavy = (counts.heavy ?? 0) + (counts.severe ?? 0);
  const moderate = counts.moderate ?? 0;
  if (heavy / total > 0.25) return { color: C.red, label: 'Хүнд түгжрэл' };
  if ((heavy + moderate) / total > 0.30) return { color: C.orange, label: 'Дунд зэрэг түгжрэлтэй' };
  return { color: C.green, label: 'Хөдөлгөөн чөлөөтэй' };
}

function shortDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} ц` : `${hrs}ц ${rem}м`;
}

function infoText(mode: TransportMode): string {
  switch (mode) {
    case 'transit': return 'Бодит цагийн хуваариа аппликэйшнаас шалгана уу';
    case 'ubcab':   return 'UBCab аппликэйшнээр захиална уу';
    case 'aba':     return 'ABA Таксины аппликэйшнээр захиална уу';
    default:        return '';
  }
}

export function DirectionsPanel({
  multi,
  loading,
  error,
  destinationName,
  onClose,
  onStart,
  onSelectMode,
}: Props) {
  if (!loading && !multi && !error) return null;

  const active = multi ? multi.modes[multi.selectedMode] ?? null : null;
  const meta = multi ? MODE_BY_KEY[multi.selectedMode] : null;
  const traffic = active ? trafficLabel(active) : null;
  const typical = active?.durationTypicalSeconds ?? null;
  const delaySec = active && typical != null ? active.durationSeconds - typical : 0;
  const canStart = !!(active && meta?.hasNavigation);

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

      {multi && !loading && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.chipScroll}
            contentContainerStyle={s.chipContent}
          >
            {MODES.map(m => {
              const r = multi.modes[m.key];
              if (!r) return null;
              const selected = m.key === multi.selectedMode;
              return (
                <TouchableOpacity
                  key={m.key}
                  style={[s.chip, selected && s.chipActive]}
                  onPress={() => onSelectMode(m.key)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={m.icon as any}
                    size={18}
                    color={selected ? '#fff' : m.color}
                  />
                  <View style={s.chipText}>
                    <Text style={[s.chipDuration, selected && s.chipTextActive]}>
                      {shortDuration(r.durationSeconds)}
                    </Text>
                    {r.price && (
                      <Text style={[s.chipPrice, selected && s.chipPriceActive]}>
                        {r.price.label}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {active && meta && (
            <View style={s.detailsWrap}>
              <View style={s.detailsHeader}>
                <Text style={s.modeLabel}>{meta.label}</Text>
                <Text style={s.distanceText}>{formatDistance(active.distanceMeters)}</Text>
              </View>

              {traffic && (
                <View style={[s.row, { marginTop: 6, gap: 6 }]}>
                  <View style={[s.dot, { backgroundColor: traffic.color }]} />
                  <Text style={[s.trafficText, { color: traffic.color }]}>{traffic.label}</Text>
                  {delaySec > 60 && (
                    <Text style={s.delayText}>+{formatDuration(delaySec)} түгжрэлээс</Text>
                  )}
                </View>
              )}

              {active.mode === 'transit' && (
                <Text style={s.disclaimer}>
                  Тооцоолсон цаг. Маршрут болон хуваарь өөр байж болзошгүй.
                </Text>
              )}

              {(active.mode === 'ubcab' || active.mode === 'aba' || active.mode === 'escooter')
                && active.price?.approximate && (
                <Text style={s.disclaimer}>
                  Тооцоолсон үнэ. Жинхэнэ үнэ цаг, эрэлтээс хамаарч өөр байж болно.
                </Text>
              )}

              {canStart ? (
                <TouchableOpacity
                  onPress={onStart}
                  activeOpacity={0.85}
                  style={[s.startBtn, { backgroundColor: meta.color }]}
                >
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={s.startBtnText}>Эхлэх</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.infoBtn}>
                  <Ionicons name="information-circle-outline" size={16} color={C.textSec} />
                  <Text style={s.infoBtnText}>{infoText(active.mode)}</Text>
                </View>
              )}
            </View>
          )}
        </>
      )}
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

  chipScroll: {
    marginTop: 12,
    marginHorizontal: -14,
  },
  chipContent: {
    paddingHorizontal: 14,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bgAlt,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: C.border,
    minWidth: 92,
  },
  chipActive: {
    backgroundColor: C.primary,
    borderColor: C.primaryLt,
  },
  chipText: {
    gap: 1,
  },
  chipDuration: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.2,
  },
  chipTextActive: {
    color: '#fff',
  },
  chipPrice: {
    fontSize: 11,
    color: C.textSec,
  },
  chipPriceActive: {
    color: 'rgba(255,255,255,0.85)',
  },

  detailsWrap: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  modeLabel: {
    fontSize: 14,
    color: C.text,
    fontWeight: '600',
  },
  distanceText: {
    fontSize: 13,
    color: C.textSec,
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
  disclaimer: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 8,
    lineHeight: 15,
    fontStyle: 'italic',
  },
  startBtn: {
    marginTop: 12,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  infoBtn: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  infoBtnText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'center',
  },
});
