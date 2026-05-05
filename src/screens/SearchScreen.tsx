import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Modal,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { FeatureCollection, Point } from 'geojson';
import type { PlaceMapFeature } from '../types/place';
import { CategoryIcon } from '../components/CategoryIcon';
import { categoryLabel } from '../constants/categories';
import {
  addRecent,
  getRecents,
  removeRecent,
  type RecentPlace,
} from '../lib/searchRecents';

const C = {
  bg:        '#080c14',
  surface:   '#111520',
  surfaceAlt:'#161b28',
  border:    'rgba(255,255,255,0.10)',
  borderSub: 'rgba(255,255,255,0.06)',
  text:      'rgba(255,255,255,0.95)',
  textSec:   'rgba(255,255,255,0.50)',
  textMuted: 'rgba(255,255,255,0.28)',
  amber:     '#FBB824',
  primary:   '#0053A3',
  primaryLt: '#1a6fc4',
  green:     '#10B981',
};

const MAX_RESULTS = 50;

// ── Cyrillic → Latin transliteration for bilingual search ─────────────────
// Digraphs must come before single chars to avoid double-substitution.
const CYR_TO_LAT: [RegExp, string][] = [
  [/щ/g, 'shch'], [/ш/g, 'sh'], [/ч/g, 'ch'], [/ц/g, 'ts'],
  [/ю/g, 'yu'],   [/я/g, 'ya'], [/ё/g, 'yo'],
  [/а/g, 'a'], [/б/g, 'b'], [/в/g, 'v'], [/г/g, 'g'], [/д/g, 'd'],
  [/е/g, 'e'], [/ж/g, 'j'], [/з/g, 'z'], [/и/g, 'i'], [/й/g, 'y'],
  [/к/g, 'k'], [/л/g, 'l'], [/м/g, 'm'], [/н/g, 'n'], [/о/g, 'o'],
  [/ө/g, 'o'], [/п/g, 'p'], [/р/g, 'r'], [/с/g, 's'], [/т/g, 't'],
  [/у/g, 'u'], [/ү/g, 'u'], [/ф/g, 'f'], [/х/g, 'h'], [/ъ/g, ''],
  [/ы/g, 'i'], [/ь/g, ''],  [/э/g, 'e'],
];

function normalizeForSearch(s: string): string {
  let r = s.toLowerCase();
  for (const [from, to] of CYR_TO_LAT) r = r.replace(from, to);
  // fold "kh" → "h" so "Khan" and "Хаан" both become "haan"-derived
  r = r.replace(/kh/g, 'h');
  // collapse everything non-alphanumeric to a single space
  return r.replace(/[^a-z0-9]+/g, ' ').trim();
}

type SearchResult = {
  place_id: string;
  name: string;
  short_address: string | null;
  primary_category: string | null;
  rating: number | null;
  lng: number;
  lat: number;
};

export type RouteWaypoint =
  | { type: 'current'; name: 'Таны байршил' }
  | { type: 'place'; place_id: string; name: string; lng: number; lat: number };

type ActiveField = 'from' | 'to';

interface Props {
  visible: boolean;
  geojson: FeatureCollection<Point, PlaceMapFeature> | null;
  userLocation?: [number, number] | null;
  onClose: () => void;
  onSelect: (placeId: string, lng: number, lat: number) => void;
  onRouteRequest?: (from: RouteWaypoint, to: RouteWaypoint) => void;
  /** When set, screen opens directly in route mode with this place pre-filled as destination. */
  initialToWaypoint?: { name: string; lng: number; lat: number; place_id?: string };
}

function buildResults(
  geojson: FeatureCollection<Point, PlaceMapFeature> | null,
  query: string,
): SearchResult[] {
  if (!geojson) return [];
  const q = normalizeForSearch(query);
  if (!q) return [];
  const out: SearchResult[] = [];
  for (const f of geojson.features) {
    const normName = normalizeForSearch(f.properties.name ?? '');
    const normAddr = normalizeForSearch(f.properties.short_address ?? '');
    const normCat  = normalizeForSearch(categoryLabel(f.properties.primary_category ?? ''));
    if (normName.includes(q) || normAddr.includes(q) || normCat.includes(q)) {
      const [lng, lat] = f.geometry.coordinates as [number, number];
      out.push({
        place_id: f.properties.place_id,
        name: f.properties.name,
        short_address: f.properties.short_address ?? null,
        primary_category: f.properties.primary_category,
        rating: f.properties.rating,
        lng,
        lat,
      });
      if (out.length >= MAX_RESULTS) break;
    }
  }
  out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return out;
}

export function SearchScreen({
  visible,
  geojson,
  userLocation,
  onClose,
  onSelect,
  onRouteRequest,
  initialToWaypoint,
}: Props) {
  // ── Search mode state ──
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  // ── Route mode state ──
  const [routeMode, setRouteMode] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>('to');
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const [fromWaypoint, setFromWaypoint] = useState<RouteWaypoint>({ type: 'current', name: 'Таны байршил' });
  const [toWaypoint, setToWaypoint] = useState<RouteWaypoint | null>(null);
  const fromRef = useRef<TextInput>(null);
  const toRef = useRef<TextInput>(null);

  // ── Recent places (re-read on each open) ──
  const [recents, setRecents] = useState<RecentPlace[]>([]);

  useEffect(() => {
    if (visible) {
      setRecents(getRecents());
      if (initialToWaypoint) {
        const wp: RouteWaypoint = {
          type: 'place',
          place_id: initialToWaypoint.place_id ?? `pin:${initialToWaypoint.lng},${initialToWaypoint.lat}`,
          name: initialToWaypoint.name,
          lng: initialToWaypoint.lng,
          lat: initialToWaypoint.lat,
        };
        setRouteMode(true);
        setToWaypoint(wp);
        setToText(initialToWaypoint.name);
        setFromWaypoint({ type: 'current', name: 'Таны байршил' });
        setFromText('');
        setActiveField('from');
        const t = setTimeout(() => fromRef.current?.focus(), 140);
        return () => clearTimeout(t);
      } else {
        setRouteMode(false);
        const t = setTimeout(() => searchInputRef.current?.focus(), 120);
        return () => clearTimeout(t);
      }
    } else {
      setQuery('');
      setRouteMode(false);
      setFromWaypoint({ type: 'current', name: 'Таны байршил' });
      setToWaypoint(null);
      setFromText('');
      setToText('');
      setActiveField('to');
    }
  }, [visible, initialToWaypoint]);

  const toggleRouteMode = useCallback(() => {
    setRouteMode(prev => {
      if (!prev) {
        // Entering route mode
        setQuery('');
        setActiveField('to');
        setTimeout(() => toRef.current?.focus(), 140);
      } else {
        // Exiting route mode
        setTimeout(() => searchInputRef.current?.focus(), 140);
      }
      return !prev;
    });
  }, []);

  const handleSwap = useCallback(() => {
    const newFrom = toWaypoint ?? { type: 'current' as const, name: 'Таны байршил' as const };
    const newTo = fromWaypoint.type === 'current' ? null : fromWaypoint;
    setFromWaypoint(newFrom);
    setToWaypoint(newTo as RouteWaypoint | null);
    setFromText(newFrom.type === 'current' ? '' : newFrom.name);
    setToText(newTo ? newTo.name : '');
  }, [fromWaypoint, toWaypoint]);

  // ── Search results ──
  const activeQuery = routeMode
    ? (activeField === 'from' ? fromText : toText)
    : query;

  const results = useMemo(
    () => buildResults(geojson, activeQuery),
    [geojson, activeQuery],
  );

  // ── Selection handlers ──
  const handleSelectSearch = useCallback((item: SearchResult) => {
    addRecent(item);
    setRecents(getRecents());
    onSelect(item.place_id, item.lng, item.lat);
  }, [onSelect]);

  const handleSelectRoute = useCallback((item: SearchResult) => {
    const waypoint: RouteWaypoint = {
      type: 'place',
      place_id: item.place_id,
      name: item.name,
      lng: item.lng,
      lat: item.lat,
    };

    if (activeField === 'from') {
      setFromWaypoint(waypoint);
      setFromText(item.name);
      if (!toWaypoint) {
        setActiveField('to');
        setTimeout(() => toRef.current?.focus(), 80);
      }
    } else {
      setToWaypoint(waypoint);
      setToText(item.name);
      if (fromWaypoint.type === 'current' || fromWaypoint) {
        // from is already set (default = current location), blur keyboard
        toRef.current?.blur();
        fromRef.current?.blur();
      }
    }
  }, [activeField, toWaypoint, fromWaypoint]);

  const handleRouteGo = useCallback(() => {
    if (!toWaypoint || !onRouteRequest) return;
    onRouteRequest(fromWaypoint, toWaypoint);
  }, [fromWaypoint, toWaypoint, onRouteRequest]);

  const handleRemoveRecent = useCallback((placeId: string) => {
    removeRecent(placeId);
    setRecents(getRecents());
  }, []);

  const routeReady = toWaypoint !== null;

  // ── Render helpers ──
  const renderResultItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.7}
      onPress={() => routeMode ? handleSelectRoute(item) : handleSelectSearch(item)}
    >
      <CategoryIcon category={item.primary_category} size={36} />
      <View style={s.rowText}>
        <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
        <View style={s.rowMeta}>
          <Text style={s.rowCat}>{categoryLabel(item.primary_category)}</Text>
          {item.rating !== null && (
            <>
              <Text style={s.rowMetaDot}>·</Text>
              <Ionicons name="star" size={11} color={C.amber} />
              <Text style={s.rowRating}>{item.rating.toFixed(1)}</Text>
            </>
          )}
        </View>
        {item.short_address ? (
          <Text style={s.rowAddr} numberOfLines={1}>{item.short_address}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );

  const renderRecentItem = ({ item }: { item: RecentPlace }) => (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.7}
      onPress={() => routeMode
        ? handleSelectRoute(item)
        : handleSelectSearch(item)
      }
    >
      <View style={s.recentIcon}>
        <Ionicons name="time-outline" size={18} color={C.textSec} />
      </View>
      <View style={s.rowText}>
        <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={s.rowCat}>{categoryLabel(item.primary_category)}</Text>
      </View>
      <TouchableOpacity
        onPress={() => handleRemoveRecent(item.place_id)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={s.removeBtn}
      >
        <Ionicons name="close" size={14} color={C.textMuted} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Determine what to show in the list area
  const showResults = activeQuery.trim().length > 0;
  const showRecents = !showResults && recents.length > 0;
  const showEmpty = !showResults && !showRecents;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={routeMode ? toggleRouteMode : onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.container}>

        {/* ── Header ── */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={routeMode ? toggleRouteMode : onClose}
            style={s.backBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={C.text} />
          </TouchableOpacity>

          {routeMode ? (
            /* ── Route mode: two inline inputs with swap ── */
            <View style={s.routeInputs}>
              {/* From row */}
              <View style={[s.waypointRow, activeField === 'from' && s.waypointRowActive]}>
                <View style={[s.waypointDot, s.waypointDotFrom]} />
                <TextInput
                  ref={fromRef}
                  style={s.waypointInput}
                  value={fromText}
                  onChangeText={(t) => {
                    setFromText(t);
                    if (t === '') setFromWaypoint({ type: 'current', name: 'Таны байршил' });
                    else if (fromWaypoint.type === 'place') setFromWaypoint({ type: 'current', name: 'Таны байршил' });
                  }}
                  placeholder={fromWaypoint.type === 'current' ? 'Таны байршил' : 'Хаанаас явах вэ?'}
                  placeholderTextColor={fromWaypoint.type === 'current' ? C.textSec : C.textMuted}
                  onFocus={() => setActiveField('from')}
                  returnKeyType="next"
                  onSubmitEditing={() => toRef.current?.focus()}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {/* My Location reset button */}
                <TouchableOpacity
                  onPress={() => {
                    setFromWaypoint({ type: 'current', name: 'Таны байршил' });
                    setFromText('');
                    fromRef.current?.focus();
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name="locate"
                    size={17}
                    color={fromWaypoint.type === 'current' ? C.primaryLt : C.textMuted}
                  />
                </TouchableOpacity>
              </View>

              {/* Swap button */}
              <TouchableOpacity style={s.swapBtn} onPress={handleSwap} activeOpacity={0.75}>
                <Ionicons name="swap-vertical" size={18} color={C.textSec} />
              </TouchableOpacity>

              {/* To row */}
              <TouchableOpacity
                style={[s.waypointRow, activeField === 'to' && s.waypointRowActive]}
                activeOpacity={1}
                onPress={() => { setActiveField('to'); toRef.current?.focus(); }}
              >
                <View style={[s.waypointDot, s.waypointDotTo]} />
                <TextInput
                  ref={toRef}
                  style={s.waypointInput}
                  value={toText}
                  onChangeText={(t) => {
                    setToText(t);
                    if (toWaypoint) setToWaypoint(null);
                  }}
                  placeholder="Хаашаа явах вэ?"
                  placeholderTextColor={C.textMuted}
                  onFocus={() => setActiveField('to')}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </TouchableOpacity>
            </View>
          ) : (
            /* ── Normal mode: single search input ── */
            <View style={s.inputWrap}>
              <Ionicons name="search" size={16} color={C.textMuted} />
              <TextInput
                ref={searchInputRef}
                style={s.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Улаанбаатарт хайх…"
                placeholderTextColor={C.textMuted}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity
                  onPress={() => setQuery('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={16} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Route mode toggle */}
          {!routeMode && (
            <TouchableOpacity
              style={s.routeToggleBtn}
              onPress={toggleRouteMode}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="git-branch-outline" size={20} color={C.primaryLt} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── "Чиглэл харах" button (route mode, both waypoints filled) ── */}
        {routeMode && routeReady && (
          <TouchableOpacity style={s.routeGoBtn} activeOpacity={0.85} onPress={handleRouteGo}>
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={s.routeGoBtnText}>Чиглэл харах</Text>
          </TouchableOpacity>
        )}

        {/* ── Results / Recents / Empty ── */}
        {showResults ? (
          results.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="search-outline" size={42} color={C.textMuted} />
              <Text style={s.emptyTitle}>Илэрц олдсонгүй</Text>
              <Text style={s.emptyDesc}>
                "{activeQuery}" гэсэн хайлтаар таарах газар олдсонгүй.
              </Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.place_id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
              ItemSeparatorComponent={() => <View style={s.separator} />}
              renderItem={renderResultItem}
            />
          )
        ) : showRecents ? (
          <FlatList
            data={recents}
            keyExtractor={(item) => item.place_id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            ListHeaderComponent={
              <Text style={s.sectionLabel}>САЯХАН ХАРСАН</Text>
            }
            ItemSeparatorComponent={() => <View style={s.separator} />}
            renderItem={renderRecentItem}
          />
        ) : (
          <View style={s.empty}>
            <Ionicons name="location-outline" size={42} color={C.textMuted} />
            <Text style={s.emptyTitle}>
              {routeMode ? 'Эхлэх эсвэл очих газар хайх' : 'Хайх газар сонгоно уу'}
            </Text>
            <Text style={s.emptyDesc}>
              {routeMode
                ? 'Дээрх нүдэнд газрын нэр бичнэ үү'
                : 'Газрын нэр эсвэл ангилалаар хайна уу\n(жишээ нь "Ресторан", "Кафе")'}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 44,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSub,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  // Normal search input
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    padding: 0,
  },

  // Route toggle button
  routeToggleBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,83,163,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,83,163,0.30)',
    marginTop: 1,
  },

  // ── Route mode inputs ──
  routeInputs: {
    flex: 1,
    gap: 0,
  },
  waypointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 42,
    marginVertical: 3,
  },
  waypointRowActive: {
    borderColor: C.primaryLt,
    backgroundColor: 'rgba(26,111,196,0.08)',
  },
  waypointDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  waypointDotFrom: {
    backgroundColor: C.green,
  },
  waypointDotTo: {
    backgroundColor: '#EF4444',
  },
  waypointInput: {
    flex: 1,
    color: C.text,
    fontSize: 13,
    padding: 0,
  },
  swapBtn: {
    alignSelf: 'center',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },

  // ── Route go button ──
  routeGoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 2,
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 13,
  },
  routeGoBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Recents ──
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  recentIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Common rows ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    color: C.text,
    letterSpacing: -0.2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  rowCat: {
    fontSize: 12,
    color: C.textMuted,
  },
  rowMetaDot: {
    fontSize: 12,
    color: C.textMuted,
  },
  rowRating: {
    fontSize: 12,
    color: C.amber,
    fontWeight: '600',
  },
  rowAddr: {
    fontSize: 11,
    color: C.textMuted,
    marginTop: 1,
  },
  separator: {
    height: 1,
    backgroundColor: C.borderSub,
    marginLeft: 64,
  },

  // ── Empty state ──
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
    marginTop: -60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textSec,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 13,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
});
