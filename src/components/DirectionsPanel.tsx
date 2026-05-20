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
import type { TransitLeg } from '../types/transit';

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
  onSelectAlternative?: (altIdx: number) => void;
  onEditRoute?: () => void;
}

function trafficLabel(route: ModeRoute): { color: string; label: string } | null {
  if (route.mode !== 'driving') return null;
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
  // Used only when meta.hasNavigation is false.  All four modes now have
  // navigation, so this is effectively dead code — kept defensively.
  switch (mode) {
    default: return '';
  }
}

// ── Transit leg cards ──────────────────────────────────────────────────────
function fmtSec(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} мин`;
  return `${Math.floor(m / 60)}ц ${m % 60}м`;
}

function TransitLegsView({ legs }: { legs: TransitLeg[] }) {
  return (
    <View style={tl.wrap}>
      {legs.map((leg, idx) => (
        <View key={`${leg.routeId}-${idx}`} style={[tl.card, idx > 0 && tl.cardNotFirst]}>
          {/* Route number pill + realtime badge */}
          <View style={tl.header}>
            <View style={tl.routePill}>
              <Ionicons name="bus" size={11} color="#fff" />
              <Text style={tl.routeNo}>{leg.routeNo}</Text>
            </View>
            {leg.hasRealtime && leg.nextArrivalSec !== null && (
              <View style={tl.realtimeBadge}>
                <View style={tl.realtimeDot} />
                <Text style={tl.realtimeText}>
                  {leg.nextArrivalSec < 60
                    ? 'Ирж байна'
                    : `${Math.round(leg.nextArrivalSec / 60)} мин`}
                </Text>
              </View>
            )}
            <Text style={tl.totalTime}>{fmtSec(leg.totalSec)}</Text>
          </View>

          {/* Journey steps */}
          <View style={tl.steps}>
            {/* Walk to stop */}
            <View style={tl.step}>
              <Ionicons name="walk" size={12} color={C.textSec} style={tl.stepIcon} />
              <Text style={tl.stepText} numberOfLines={1}>
                {fmtSec(leg.walkToStopSec)} явган → {leg.boardStop.nameMn || leg.boardStop.nameEn}
              </Text>
            </View>
            {/* Board */}
            <View style={tl.step}>
              <Ionicons name="arrow-up-circle" size={12} color={C.green} style={tl.stepIcon} />
              <Text style={tl.stepText} numberOfLines={1}>
                Суух: <Text style={tl.stopName}>{leg.boardStop.nameMn || leg.boardStop.nameEn}</Text>
              </Text>
              {leg.boardStopDistM > 0 && (
                <Text style={tl.stopDist}> · {leg.boardStopDistM}м</Text>
              )}
            </View>
            {/* Ride */}
            <View style={tl.step}>
              <Ionicons name="bus" size={12} color={C.green} style={tl.stepIcon} />
              <Text style={tl.stepText}>
                {leg.stopCount} буудал · {fmtSec(leg.rideSec)}
              </Text>
            </View>
            {/* Alight */}
            <View style={tl.step}>
              <Ionicons name="arrow-down-circle" size={12} color={C.amber} style={tl.stepIcon} />
              <Text style={tl.stepText} numberOfLines={1}>
                Буух: <Text style={tl.stopName}>{leg.alightStop.nameMn || leg.alightStop.nameEn}</Text>
              </Text>
            </View>
            {/* Walk from stop */}
            {leg.walkFromStopSec > 30 && (
              <View style={tl.step}>
                <Ionicons name="walk" size={12} color={C.textSec} style={tl.stepIcon} />
                <Text style={tl.stepText}>{fmtSec(leg.walkFromStopSec)} явган → очих цэг</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

export function DirectionsPanel({
  multi,
  loading,
  error,
  destinationName,
  onClose,
  onStart,
  onSelectMode,
  onSelectAlternative,
  onEditRoute,
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
        {onEditRoute && (
          <TouchableOpacity
            onPress={onEditRoute}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={s.editBtn}
          >
            <Ionicons name="swap-vertical-outline" size={14} color={C.primaryLt} />
            <Text style={s.editBtnText}>Эхлэх цэг</Text>
          </TouchableOpacity>
        )}
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

              {active.mode === 'driving' && active.alternatives && active.alternatives.length > 0 && (
                <View style={alt.wrap}>
                  <Text style={alt.label}>ӨӨР ЗАМ</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={alt.row}
                  >
                    {active.alternatives.map((a, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={alt.chip}
                        onPress={() => onSelectAlternative?.(idx)}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="git-branch-outline" size={12} color={C.textSec} />
                        <Text style={alt.chipDur}>{shortDuration(a.durationSeconds)}</Text>
                        <Text style={alt.chipDist}>· {formatDistance(a.distanceMeters)}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {active.mode === 'transit' && active.transitLegs && active.transitLegs.length > 0 && (
                <TransitLegsView legs={active.transitLegs} />
              )}

              {active.mode === 'escooter' && active.price?.approximate && (
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
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(26,111,196,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(26,111,196,0.30)',
    marginRight: 8,
  },
  editBtnText: {
    color: C.primaryLt,
    fontSize: 11,
    fontWeight: '600',
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

// Transit leg styles
const tl = StyleSheet.create({
  wrap: {
    marginTop: 10,
    gap: 8,
  },
  card: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.22)',
    padding: 10,
  },
  cardNotFirst: {
    opacity: 0.75,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  routePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.green,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  routeNo: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  realtimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.30)',
  },
  realtimeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  realtimeText: {
    color: C.green,
    fontSize: 10,
    fontWeight: '600',
  },
  totalTime: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  steps: {
    gap: 5,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepIcon: {
    marginRight: 6,
    width: 14,
  },
  stepText: {
    color: C.textSec,
    fontSize: 11,
    flex: 1,
  },
  stopName: {
    color: C.text,
    fontWeight: '600',
  },
  stopDist: {
    color: C.textMuted,
    fontSize: 10,
  },
});

// ── Alternative-route chip styles ────────────────────────────────────────────
const alt = StyleSheet.create({
  wrap: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  label: {
    color: C.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.bgAlt,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipDur: {
    color: C.text,
    fontSize: 12,
    fontWeight: '600',
  },
  chipDist: {
    color: C.textSec,
    fontSize: 11,
  },
});
