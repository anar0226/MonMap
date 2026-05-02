import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Place } from '../types/place';

const { height: SCREEN_H } = Dimensions.get('window');

const COLLAPSED_H = 182;
const EXPANDED_H = Math.min(Math.round(SCREEN_H * 0.80), 640);

// ── Category colours (matches MapScreen) ──────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  restaurant: '#E53935', cafe: '#6D4C41', bar: '#7B1FA2',
  bakery: '#FB8C00', grocery_or_supermarket: '#43A047',
  convenience_store: '#00897B', shopping_mall: '#3949AB',
  clothing_store: '#E91E63', beauty_salon: '#AD1457',
  hair_care: '#880E4F', spa: '#00838F', gym: '#2E7D32',
  pharmacy: '#C62828', hospital: '#B71C1C', doctor: '#EF5350',
  dentist: '#1565C0', bank: '#0D47A1', car_repair: '#37474F',
  gas_station: '#E65100',
};
const FALLBACK_COLOR = '#1A73E8';

const CATEGORY_LABELS: Record<string, string> = {
  restaurant: 'Ресторан', cafe: 'Кафе', bar: 'Бар',
  bakery: 'Нарийн боов', grocery_or_supermarket: 'Дэлгүүр',
  convenience_store: 'Дэлгүүр', shopping_mall: 'Худалдааны төв',
  clothing_store: 'Хувцасны дэлгүүр', beauty_salon: 'Гоо сайхан',
  hair_care: 'Үсний салон', spa: 'Спа', gym: 'Фитнесс',
  pharmacy: 'Эмийн сан', hospital: 'Эмнэлэг', doctor: 'Эмч',
  dentist: 'Шүдний эмч', bank: 'Банк', car_repair: 'Авто засвар',
  gas_station: 'Шатахуун',
};

const BOOKABLE_CATEGORIES = new Set([
  'restaurant', 'spa', 'hair_care', 'beauty_salon', 'gym', 'dentist', 'doctor',
]);

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:         '#111520',
  surface:    '#0D1220',
  border:     'rgba(255,255,255,0.10)',
  borderSub:  'rgba(255,255,255,0.06)',
  primary:    '#0053A3',
  primaryLt:  '#1a6fc4',
  primaryDim: 'rgba(0,83,163,0.18)',
  text:       'rgba(255,255,255,0.95)',
  textSec:    'rgba(255,255,255,0.50)',
  textMuted:  'rgba(255,255,255,0.30)',
  amber:      '#FBB824',
  green:      '#10B981',
  red:        '#EF4444',
};

// ── Sub-components ────────────────────────────────────────────────────────────

const Stars = ({ value, size = 12 }: { value: number; size?: number }) => (
  <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
    {[1, 2, 3, 4, 5].map(i => (
      <Ionicons
        key={i}
        name={i <= Math.round(value) ? 'star' : 'star-outline'}
        size={size}
        color={i <= Math.round(value) ? C.amber : C.border}
      />
    ))}
  </View>
);

const CatDot = ({ category, size = 10 }: { category: string | null; size?: number }) => (
  <View style={{
    width: size, height: size, borderRadius: size / 2,
    backgroundColor: CATEGORY_COLORS[category ?? ''] ?? FALLBACK_COLOR,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  }} />
);

const Pill = ({ label }: { label: string }) => (
  <View style={s.pill}>
    <Text style={s.pillText}>{label}</Text>
  </View>
);

const InfoRow = ({
  icon, children,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  children: React.ReactNode;
}) => (
  <View style={s.infoRow}>
    <Ionicons name={icon} size={14} color={C.textMuted} style={{ marginTop: 2 }} />
    <Text style={s.infoRowText}>{children}</Text>
  </View>
);

const Div = () => <View style={s.divider} />;

const QuickBtn = ({
  icon, label, highlight, onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  highlight?: boolean;
  onPress?: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[s.quickBtn, highlight && s.quickBtnHighlight]}
  >
    <Ionicons name={icon} size={18} color={highlight ? C.primaryLt : C.textSec} />
    <Text style={[s.quickBtnLabel, { color: highlight ? C.primaryLt : C.textMuted }]}>
      {label}
    </Text>
  </TouchableOpacity>
);

// ── Tab: Мэдээлэл ─────────────────────────────────────────────────────────────

const InfoTab = ({ place }: { place: Place }) => {
  const hoursLines = place.regular_opening_hours?.weekday_descriptions ?? [];
  const address = place.formatted_address ?? place.short_address;
  const phone = place.phone_national ?? place.phone_intl;

  return (
    <View style={{ gap: 14 }}>
      {(address || phone || hoursLines.length > 0) && (
        <View style={{ gap: 10 }}>
          {address && <InfoRow icon="location-outline">{address}</InfoRow>}
          {hoursLines.length > 0 && (
            <InfoRow icon="time-outline">
              {hoursLines.join('\n')}
            </InfoRow>
          )}
          {phone && <InfoRow icon="call-outline">{phone}</InfoRow>}
        </View>
      )}

      <Div />

      {/* Mini map placeholder */}
      <View style={s.miniMap}>
        <View style={s.miniMapPin}>
          <Ionicons name="location" size={14} color="#fff" />
        </View>
        <Text style={s.miniMapLabel}>ГАЗРЫН ЗУРАГ</Text>
      </View>
    </View>
  );
};

// ── Tab: Захиалах ─────────────────────────────────────────────────────────────

const TIME_SLOTS = [
  '10:00', '10:30', '11:00', '11:30', '12:00',
  '12:30', '13:00', '13:30', '14:00',
];
const UNAVAILABLE = new Set([2, 5]);

const BookTab = ({ isBookable }: { isBookable: boolean }) => {
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [partySize, setPartySize] = useState(2);
  const partySizes: Array<string | number> = [1, 2, 3, 4, '5+'];

  if (!isBookable) {
    return (
      <View style={s.emptyState}>
        <View style={s.emptyIcon}>
          <Ionicons name="calendar-outline" size={22} color={C.textMuted} />
        </View>
        <Text style={s.emptyTitle}>Захиалга боломжгүй</Text>
        <Text style={s.emptyDesc}>
          Энэ газар одоогоор онлайн захиалга хүлээн авахгүй байна.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {/* Next slot banner */}
      <View style={s.nextSlotBanner}>
        <View>
          <Text style={s.nextSlotLabel}>Дараагийн боломжит цаг</Text>
          <Text style={s.nextSlotValue}>Өнөөдөр, {TIME_SLOTS[selectedSlot]}</Text>
        </View>
        <Ionicons name="calendar-outline" size={22} color={C.primaryLt} />
      </View>

      {/* Time slot grid */}
      <View>
        <Text style={s.sectionLabel}>ӨНӨӨДРИЙН ЦАГИЙН ХУВААРЬ</Text>
        <View style={s.slotGrid}>
          {TIME_SLOTS.map((slot, i) => {
            const unavail = UNAVAILABLE.has(i);
            const sel = i === selectedSlot && !unavail;
            return (
              <TouchableOpacity
                key={slot}
                disabled={unavail}
                onPress={() => setSelectedSlot(i)}
                activeOpacity={0.7}
                style={[
                  s.slotBtn,
                  sel && s.slotBtnSel,
                  unavail && s.slotBtnUnavail,
                ]}
              >
                <Text style={[
                  s.slotText,
                  sel && s.slotTextSel,
                  unavail && s.slotTextUnavail,
                ]}>
                  {slot}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Party size */}
      <View>
        <Text style={s.sectionLabel}>ХҮНИЙ ТОО</Text>
        <View style={s.partySizeRow}>
          {partySizes.map((n, i) => {
            const sel = i + 1 === partySize || (i === 4 && partySize > 4);
            return (
              <TouchableOpacity
                key={String(n)}
                onPress={() => setPartySize(i < 4 ? i + 1 : 5)}
                activeOpacity={0.7}
                style={[s.sizeBtn, sel && s.sizeBtnSel]}
              >
                <Text style={[s.sizeText, sel && s.sizeTextSel]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Div />

      <TouchableOpacity style={s.ctaPrimary} activeOpacity={0.85}>
        <Text style={s.ctaPrimaryText}>Захиалгыг баталгаажуулах</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.ctaSecondary} activeOpacity={0.85}>
        <Text style={s.ctaSecondaryText}>Хүлээлгийн жагсаалтад нэгдэх</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Tab: Сэтгэгдэл ───────────────────────────────────────────────────────────

const RATING_BARS = [78, 14, 5, 2, 1];

const ReviewsTab = ({ place }: { place: Place }) => {
  const rating = place.rating ?? 0;
  const count = place.user_rating_count ?? 0;

  return (
    <View style={{ gap: 0 }}>
      {/* Summary */}
      <View style={s.ratingSummary}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text style={s.ratingBig}>{rating.toFixed(1)}</Text>
          <Stars value={rating} size={11} />
          <Text style={s.ratingCountSm}>{count} ҮНЭЛГЭЭ</Text>
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          {[5, 4, 3, 2, 1].map((n, i) => (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={s.barNum}>{n}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${RATING_BARS[i]}%` as any }]} />
              </View>
              <Text style={s.barPct}>{RATING_BARS[i]}%</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ marginTop: 8 }}>
        <Text style={[s.emptyDesc, { textAlign: 'center', paddingVertical: 24 }]}>
          Одоогоор сэтгэгдэл байхгүй байна.
        </Text>
      </View>

      <TouchableOpacity style={s.writeReviewBtn} activeOpacity={0.7}>
        <Ionicons name="add-outline" size={14} color={C.textSec} />
        <Text style={s.writeReviewText}>Сэтгэгдэл бичих</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  place: Place | null;
  loading: boolean;
  onClose: () => void;
}

export function PlaceDetailCard({ place, loading, onClose }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'info' | 'book' | 'reviews'>('info');

  const visible = place !== null || loading;

  // translateY strategy: sheet height is fixed at EXPANDED_H.
  // 0            = fully visible (expanded state)
  // EXPANDED_H-COLLAPSED_H = collapsed (only COLLAPSED_H peeking up)
  // EXPANDED_H   = fully off-screen (hidden)
  const sheetY = useRef(new Animated.Value(EXPANDED_H)).current;

  useEffect(() => {
    const toValue = !visible
      ? EXPANDED_H
      : expanded
      ? 0
      : EXPANDED_H - COLLAPSED_H;
    Animated.spring(sheetY, {
      toValue,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
    if (!visible) {
      setExpanded(false);
      setTab('info');
    }
  }, [visible, expanded]);

  const catColor = CATEGORY_COLORS[place?.primary_category ?? ''] ?? FALLBACK_COLOR;
  const catLabel = (CATEGORY_LABELS[place?.primary_category ?? ''] ?? place?.primary_category ?? '').toUpperCase();
  const isOpen = place?.current_opening_hours?.open_now;
  const isBookable = BOOKABLE_CATEGORIES.has(place?.primary_category ?? '');
  const phone = place?.phone_national ?? place?.phone_intl;

  const TABS = [
    { id: 'info' as const,    label: 'Мэдээлэл' },
    { id: 'book' as const,    label: 'Захиалах' },
    { id: 'reviews' as const, label: 'Сэтгэгдэл' },
  ];

  return (
    <Animated.View
      style={[s.sheet, { transform: [{ translateY: sheetY }] }]}
      pointerEvents={visible ? 'box-none' : 'none'}
    >
      {/* Drag handle */}
      <TouchableOpacity
        onPress={() => setExpanded(p => !p)}
        style={s.handleArea}
        activeOpacity={1}
      >
        <View style={s.handle} />
      </TouchableOpacity>

      {/* Peek header */}
      <View style={s.header}>
        {loading && !place ? (
          <ActivityIndicator color={C.primaryLt} size="small" style={{ marginVertical: 12 }} />
        ) : place ? (
          <>
            {/* Category + status row */}
            <View style={s.metaRow}>
              <CatDot category={place.primary_category} />
              <Text style={s.catLabel}>{catLabel}</Text>
              {catLabel && isOpen !== undefined && (
                <Text style={s.metaDot}>·</Text>
              )}
              {isOpen !== undefined && (
                <View style={[
                  s.statusBadge,
                  { backgroundColor: isOpen ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)' },
                ]}>
                  <Text style={[s.statusText, { color: isOpen ? C.green : C.red }]}>
                    {isOpen ? 'НЭЭЛТТЭЙ' : 'ХААЛТТАЙ'}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => setExpanded(p => !p)}
                style={s.chevronBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={expanded ? 'chevron-down' : 'chevron-up'}
                  size={14}
                  color={C.textMuted}
                />
              </TouchableOpacity>
            </View>

            {/* Place name */}
            <Text style={s.placeName} numberOfLines={1}>{place.name}</Text>

            {/* Rating row */}
            {place.rating !== null && (
              <View style={s.ratingRow}>
                <Stars value={place.rating} size={12} />
                <Text style={s.ratingNum}>{place.rating.toFixed(1)}</Text>
                {place.user_rating_count !== null && (
                  <Text style={s.ratingCount}>({place.user_rating_count} үнэлгээ)</Text>
                )}
              </View>
            )}
          </>
        ) : null}
      </View>

      {/* Quick actions */}
      {place && (
        <View style={s.quickRow}>
          <QuickBtn icon="navigate-outline" label="Чиглэл" highlight />
          <QuickBtn
            icon="call-outline"
            label="Залгах"
            onPress={() => phone && Linking.openURL('tel:' + phone.replace(/\s/g, ''))}
          />
          <QuickBtn icon="bookmark-outline" label="Хадгалах" />
          <QuickBtn icon="share-outline" label="Хуваалцах" />
        </View>
      )}

      {/* Expanded content — only rendered when expanded to avoid layout cost */}
      {expanded && place && (
        <View style={s.expandedContent}>
          <Div />

          {/* Cover photo placeholder */}
          <View style={[s.cover, { backgroundColor: catColor + '22' }]}>
            <View style={[s.coverIcon, {
              backgroundColor: catColor + '33',
              borderColor: catColor + '66',
            }]}>
              <CatDot category={place.primary_category} size={18} />
            </View>
            <Text style={s.coverLabel}>ЗУРГИЙН БАЙРШИЛ</Text>
          </View>

          {/* Tab bar */}
          <View style={s.tabBar}>
            {TABS.map(t => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTab(t.id)}
                activeOpacity={0.7}
                style={[s.tabItem, tab === t.id && s.tabItemActive]}
              >
                <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab body */}
          <ScrollView
            style={s.tabBody}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'info'    && <InfoTab place={place} />}
            {tab === 'book'    && <BookTab isBookable={isBookable} />}
            {tab === 'reviews' && <ReviewsTab place={place} />}
          </ScrollView>
        </View>
      )}
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: EXPANDED_H,
    backgroundColor: C.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // ── Handle ──
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Header ──
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 0,
    gap: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  catLabel: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.6,
    fontWeight: '500',
  },
  metaDot: {
    fontSize: 11,
    color: C.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  chevronBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeName: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
    lineHeight: 22,
    marginTop: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  ratingNum: {
    fontSize: 13,
    fontWeight: '600',
    color: C.amber,
  },
  ratingCount: {
    fontSize: 12,
    color: C.textMuted,
  },

  // ── Quick actions ──
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
  },
  quickBtnHighlight: {
    backgroundColor: C.primaryDim,
    borderColor: C.primary + '60',
  },
  quickBtnLabel: {
    fontSize: 10.5,
    letterSpacing: 0.3,
    fontWeight: '500',
  },

  // ── Expanded ──
  expandedContent: {
    flex: 1,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: C.borderSub,
    marginHorizontal: -0,
  },
  cover: {
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverLabel: {
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 1.2,
  },

  // ── Tabs ──
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: C.borderSub,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabItemActive: {
    borderBottomColor: C.primary,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: C.textMuted,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    fontWeight: '600',
    color: C.primaryLt,
  },
  tabBody: {
    flex: 1,
  },

  // ── InfoRow ──
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  infoRowText: {
    flex: 1,
    fontSize: 13,
    color: C.textSec,
    lineHeight: 20,
  },

  // ── Mini map ──
  miniMap: {
    height: 88,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  miniMapPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniMapLabel: {
    fontSize: 9,
    color: C.textMuted,
    letterSpacing: 1,
  },

  // ── Pill ──
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: C.border,
  },
  pillText: {
    fontSize: 11,
    color: C.textSec,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // ── Book tab ──
  nextSlotBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.primaryDim,
    borderWidth: 1,
    borderColor: C.primary + '44',
    borderRadius: 12,
    padding: 14,
  },
  nextSlotLabel: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  nextSlotValue: {
    fontSize: 18,
    fontWeight: '700',
    color: C.primaryLt,
    letterSpacing: -0.3,
  },
  sectionLabel: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: C.border,
  },
  slotBtnSel: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  slotBtnUnavail: {
    opacity: 0.35,
  },
  slotText: {
    fontSize: 13,
    color: C.textSec,
    fontWeight: '400',
  },
  slotTextSel: {
    color: '#fff',
    fontWeight: '600',
  },
  slotTextUnavail: {
    textDecorationLine: 'line-through',
    color: C.textMuted,
  },
  partySizeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
  },
  sizeBtnSel: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  sizeText: {
    fontSize: 14,
    color: C.textSec,
    fontWeight: '400',
  },
  sizeTextSel: {
    color: '#fff',
    fontWeight: '600',
  },
  ctaPrimary: {
    backgroundColor: C.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.1,
  },
  ctaSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  ctaSecondaryText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textSec,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: C.textSec,
  },
  emptyDesc: {
    fontSize: 12,
    color: C.textMuted,
    lineHeight: 18,
    textAlign: 'center',
  },

  // ── Reviews tab ──
  ratingSummary: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  ratingBig: {
    fontSize: 38,
    fontWeight: '700',
    color: C.amber,
    letterSpacing: -1.5,
    lineHeight: 42,
  },
  ratingCountSm: {
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  barNum: {
    fontSize: 10,
    color: C.textMuted,
    width: 8,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: C.amber,
  },
  barPct: {
    fontSize: 10,
    color: C.textMuted,
    width: 24,
  },
  writeReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginTop: 12,
  },
  writeReviewText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.textSec,
  },
});
