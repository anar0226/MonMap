import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Place } from '../types/place';
import { CategoryIcon } from './CategoryIcon';
import {
  CATEGORY_COLORS,
  FALLBACK_COLOR,
  CATEGORY_LABELS,
  BOOKABLE_CATEGORIES,
} from '../constants/categories';
import { useReviews, computeRatingBars, computeAverageRating, type Review } from '../hooks/useReviews';
import { useBooking, generateTimeSlots, todayDateString } from '../hooks/useBooking';

const { height: SCREEN_H } = Dimensions.get('window');

const COLLAPSED_H = 182;
const EXPANDED_H = Math.min(Math.round(SCREEN_H * 0.80), 640);

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

const StarPicker = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <View style={{ flexDirection: 'row', gap: 6 }}>
    {[1, 2, 3, 4, 5].map(i => (
      <TouchableOpacity key={i} onPress={() => onChange(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <Ionicons
          name={i <= value ? 'star' : 'star-outline'}
          size={28}
          color={i <= value ? C.amber : C.textMuted}
        />
      </TouchableOpacity>
    ))}
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

// Small peek-header rating pulled live from our reviews table
const PlaceRatingRow = ({ placeId }: { placeId: string }) => {
  const { reviews, fetchReviews } = useReviews(placeId);
  useEffect(() => { fetchReviews(placeId); }, [placeId]);
  if (reviews.length === 0) return null;
  const avg = computeAverageRating(reviews);
  return (
    <View style={s.ratingRow}>
      <Stars value={avg} size={12} />
      <Text style={s.ratingNum}>{avg.toFixed(1)}</Text>
      <Text style={s.ratingCount}>({reviews.length} үнэлгээ)</Text>
    </View>
  );
};

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

const TIME_SLOTS = generateTimeSlots(10, 20);

const BookTab = ({ place, isBookable }: { place: Place; isBookable: boolean }) => {
  const today = todayDateString();
  const { slots, loadingSlots, submitting, error, confirmed, fetchSlots, submitBooking, resetConfirmed } = useBooking();
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [showForm, setShowForm] = useState(false);
  const partySizes: Array<string | number> = [1, 2, 3, 4, '5+'];

  useEffect(() => {
    if (isBookable) fetchSlots(place.place_id, today, TIME_SLOTS);
  }, [place.place_id, isBookable]);

  const handleConfirm = async () => {
    if (!guestName.trim()) {
      Alert.alert('Нэрээ оруулна уу');
      return;
    }
    const slot = slots[selectedSlotIdx];
    if (!slot?.available) return;
    await submitBooking({
      placeId: place.place_id,
      date: today,
      timeSlot: slot.slot,
      partySize,
      guestName: guestName.trim(),
      guestPhone: guestPhone.trim(),
    });
  };

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

  if (confirmed) {
    return (
      <View style={s.emptyState}>
        <View style={[s.emptyIcon, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
          <Ionicons name="checkmark-circle-outline" size={28} color={C.green} />
        </View>
        <Text style={[s.emptyTitle, { color: C.green }]}>Захиалга баталгаажлаа!</Text>
        <Text style={s.emptyDesc}>
          {slots[selectedSlotIdx]?.slot} цагт {partySize} хүний захиалга бүртгэгдлээ.
        </Text>
        <TouchableOpacity
          style={[s.ctaSecondary, { marginTop: 16, alignSelf: 'stretch' }]}
          onPress={() => { resetConfirmed(); setShowForm(false); fetchSlots(place.place_id, today, TIME_SLOTS); }}
          activeOpacity={0.8}
        >
          <Text style={s.ctaSecondaryText}>Буцах</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const availableSlots = slots.length > 0 ? slots : TIME_SLOTS.map(s => ({ slot: s, booked: 0, available: true }));
  const selectedSlot = availableSlots[selectedSlotIdx];
  const nextAvailIdx = availableSlots.findIndex(s => s.available);

  return (
    <View style={{ gap: 16 }}>
      {error && (
        <Text style={{ color: C.red, fontSize: 12, textAlign: 'center' }}>{error}</Text>
      )}

      <View style={s.nextSlotBanner}>
        <View>
          <Text style={s.nextSlotLabel}>Дараагийн боломжит цаг</Text>
          <Text style={s.nextSlotValue}>
            {nextAvailIdx >= 0 ? `Өнөөдөр, ${availableSlots[nextAvailIdx].slot}` : 'Өнөөдөр захиалга дүүрсэн'}
          </Text>
        </View>
        {loadingSlots
          ? <ActivityIndicator size="small" color={C.primaryLt} />
          : <Ionicons name="calendar-outline" size={22} color={C.primaryLt} />
        }
      </View>

      <View>
        <Text style={s.sectionLabel}>ӨНӨӨДРИЙН ЦАГИЙН ХУВААРЬ</Text>
        <View style={s.slotGrid}>
          {availableSlots.map((item, i) => {
            const unavail = !item.available;
            const sel = i === selectedSlotIdx && !unavail;
            return (
              <TouchableOpacity
                key={item.slot}
                disabled={unavail}
                onPress={() => setSelectedSlotIdx(i)}
                activeOpacity={0.7}
                style={[s.slotBtn, sel && s.slotBtnSel, unavail && s.slotBtnUnavail]}
              >
                <Text style={[s.slotText, sel && s.slotTextSel, unavail && s.slotTextUnavail]}>
                  {item.slot}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

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

      {showForm ? (
        <View style={{ gap: 10 }}>
          <TextInput
            style={s.textInput}
            placeholder="Нэр *"
            placeholderTextColor={C.textMuted}
            value={guestName}
            onChangeText={setGuestName}
          />
          <TextInput
            style={s.textInput}
            placeholder="Утасны дугаар"
            placeholderTextColor={C.textMuted}
            keyboardType="phone-pad"
            value={guestPhone}
            onChangeText={setGuestPhone}
          />
          <TouchableOpacity
            style={[s.ctaPrimary, (!selectedSlot?.available || submitting) && { opacity: 0.5 }]}
            activeOpacity={0.85}
            disabled={!selectedSlot?.available || submitting}
            onPress={handleConfirm}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.ctaPrimaryText}>Захиалгыг баталгаажуулах</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.ctaSecondary} activeOpacity={0.85} onPress={() => setShowForm(false)}>
            <Text style={s.ctaSecondaryText}>Буцах</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity
            style={[s.ctaPrimary, !selectedSlot?.available && { opacity: 0.4 }]}
            activeOpacity={0.85}
            disabled={!selectedSlot?.available}
            onPress={() => setShowForm(true)}
          >
            <Text style={s.ctaPrimaryText}>Захиалгыг баталгаажуулах</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ctaSecondary} activeOpacity={0.85}>
            <Text style={s.ctaSecondaryText}>Хүлээлгийн жагсаалтад нэгдэх</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

// ── Tab: Сэтгэгдэл ───────────────────────────────────────────────────────────

const ReviewCard = ({ review }: { review: Review }) => {
  const date = new Date(review.created_at).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <View style={s.reviewCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text style={s.reviewAuthor}>{review.author_name}</Text>
        <Text style={s.reviewDate}>{date}</Text>
      </View>
      <Stars value={review.rating} size={11} />
      {review.body ? (
        <Text style={s.reviewBody}>{review.body}</Text>
      ) : null}
    </View>
  );
};

const WriteReviewForm = ({
  placeId,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  placeId: string;
  onSubmit: (name: string, rating: number, body: string) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) => {
  const [name, setName] = useState('');
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');

  return (
    <View style={s.reviewForm}>
      <Text style={[s.sectionLabel, { marginBottom: 12 }]}>СЭТГЭГДЭЛ БИЧИХ</Text>
      {error && <Text style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
      <StarPicker value={rating} onChange={setRating} />
      <TextInput
        style={[s.textInput, { marginTop: 12 }]}
        placeholder="Нэр *"
        placeholderTextColor={C.textMuted}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={[s.textInput, { marginTop: 8, height: 80, textAlignVertical: 'top' }]}
        placeholder="Сэтгэгдэл (заавал биш)"
        placeholderTextColor={C.textMuted}
        multiline
        value={body}
        onChangeText={setBody}
      />
      <TouchableOpacity
        style={[s.ctaPrimary, { marginTop: 12 }, (submitting || !name.trim()) && { opacity: 0.5 }]}
        activeOpacity={0.85}
        disabled={submitting || !name.trim()}
        onPress={() => onSubmit(name.trim(), rating, body.trim())}
      >
        {submitting
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={s.ctaPrimaryText}>Илгээх</Text>
        }
      </TouchableOpacity>
      <TouchableOpacity style={[s.ctaSecondary, { marginTop: 8 }]} activeOpacity={0.85} onPress={onCancel}>
        <Text style={s.ctaSecondaryText}>Буцах</Text>
      </TouchableOpacity>
    </View>
  );
};

const ReviewsTab = ({ place }: { place: Place }) => {
  const { reviews, loading, submitting, error, fetchReviews, submitReview } = useReviews(place.place_id);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchReviews(place.place_id);
  }, [place.place_id]);

  const handleSubmit = useCallback(async (name: string, rating: number, body: string) => {
    const ok = await submitReview(place.place_id, name, rating, body);
    if (ok) setShowForm(false);
  }, [place.place_id, submitReview]);

  const rating = computeAverageRating(reviews);
  const count = reviews.length;
  const ratingBars = computeRatingBars(reviews);

  if (showForm) {
    return (
      <WriteReviewForm
        placeId={place.place_id}
        onSubmit={handleSubmit}
        onCancel={() => setShowForm(false)}
        submitting={submitting}
        error={error}
      />
    );
  }

  return (
    <View style={{ gap: 0 }}>
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
                <View style={[s.barFill, { width: `${ratingBars[i]}%` as any }]} />
              </View>
              <Text style={s.barPct}>{ratingBars[i]}%</Text>
            </View>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={C.primaryLt} style={{ paddingVertical: 24 }} />
      ) : reviews.length === 0 ? (
        <Text style={[s.emptyDesc, { textAlign: 'center', paddingVertical: 24 }]}>
          Одоогоор сэтгэгдэл байхгүй байна.
        </Text>
      ) : (
        <View style={{ gap: 10, marginBottom: 8 }}>
          {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </View>
      )}

      <TouchableOpacity style={s.writeReviewBtn} activeOpacity={0.7} onPress={() => setShowForm(true)}>
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
            <View style={s.metaRow}>
              <CategoryIcon category={place.primary_category} size={22} />
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

            <Text style={s.placeName} numberOfLines={1}>{place.name}</Text>

            <PlaceRatingRow placeId={place.place_id} />
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

      {expanded && place && (
        <View style={s.expandedContent}>
          <Div />

          <View style={[s.cover, { backgroundColor: catColor + '22' }]}>
            <CategoryIcon category={place.primary_category} size={44} />
            <Text style={s.coverLabel}>ЗУРГИЙН БАЙРШИЛ</Text>
          </View>

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

          <ScrollView
            style={s.tabBody}
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {tab === 'info'    && <InfoTab place={place} />}
            {tab === 'book'    && <BookTab place={place} isBookable={isBookable} />}
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
  coverLabel: {
    fontSize: 10,
    color: C.textMuted,
    letterSpacing: 1.2,
  },

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

  textInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.text,
  },

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
  reviewCard: {
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  reviewAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: C.text,
  },
  reviewDate: {
    fontSize: 11,
    color: C.textMuted,
  },
  reviewBody: {
    fontSize: 13,
    color: C.textSec,
    lineHeight: 20,
    marginTop: 6,
  },
  reviewForm: {
    gap: 0,
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
