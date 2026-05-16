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
  Share,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import type { Place } from '../types/place';
import { CategoryIcon } from './CategoryIcon';
import { MAPBOX_STYLE } from '../constants/config';
import {
  CATEGORY_COLORS,
  FALLBACK_COLOR,
  CATEGORY_LABELS,
  BOOKABLE_CATEGORIES,
} from '../constants/categories';
import { useReviews, computeRatingBars, computeAverageRating, type Review } from '../hooks/useReviews';
import { useBooking, generateTimeSlots, parseTodayHours, todayDateString, type PaymentIntentData } from '../hooks/useBooking';
import PaymentModal from './PaymentModal';
import { useClosureReport } from '../hooks/useClosureReport';
import { useConfirmOpen } from '../hooks/useConfirmOpen';
import { useSavedPlaces } from '../hooks/useSavedPlaces';
import { getOpenStatus, isStaleStatus, type OpenStatus } from '../utils/openStatus';
import { useSupabase } from '../context/SupabaseContext';
import { formatMnAddress } from '../lib/mnAddress';

/**
 * Last-seating buffer (minutes) for the booking time-slot generator,
 * picked by primary_category until places.slot_duration_minutes exists in
 * the schema. Conservative defaults — better to lose one borderline slot
 * than oversell one that ends after closing time.
 *
 * Categories taken from constants/categories.ts (slug strings).
 */
function bookingBufferForCategory(category: string | null | undefined): number {
  switch (category) {
    case 'salon':         return 45;   // haircut: 30–45 min
    case 'restaurant':    return 60;   // table turn ~60 min
    case 'clinic':        return 30;   // appointment: 15–30 min
    case 'gym':           return 60;   // class: 60 min
    case 'spa':           return 90;   // massage: 60–90 min
    case 'training':      return 60;   // class: 60 min
    case 'auto_repair':   return 90;   // service drop-off
    case 'photo_studio':  return 90;   // session: 60–90 min
    default:              return 60;   // safe middle ground
  }
}

/**
 * Build the best-available address string for a place: prefer structured
 * Mongolian (district/khoroo/khoroolol/byr/khaalga/toot), fall back to the
 * Google/OSM blob, then to short_address.
 */
function placeAddress(place: Place): string {
  const structured = formatMnAddress({
    district: place.district ?? undefined,
    khoroo: place.khoroo ?? undefined,
    khoroolol: place.khoroolol ?? undefined,
    buildingNumber: place.building_number ?? undefined,
    entranceNumber: place.entrance_number ?? undefined,
    unitNumber: place.unit_number ?? undefined,
  });
  return structured || place.formatted_address || place.short_address || '';
}

const { height: SCREEN_H } = Dimensions.get('window');

const COLLAPSED_H = 182;
const EXPANDED_H = Math.min(Math.round(SCREEN_H * 0.80), 640);

const AR_TEAL = '#00d4a8';
const AR_NEARBY_THRESHOLD = 20; // meters

function haversineMeters([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
      <TouchableOpacity
        key={i}
        onPress={() => onChange(i)}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={`${i} од өгөх`}
      >
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

// ── AR Live View ─────────────────────────────────────────────────────────────

const ARLiveViewSection = ({
  nearby,
  distanceM,
  walkMins,
  onPress,
}: {
  nearby: boolean;
  distanceM: number;
  walkMins: number;
  onPress: () => void;
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const liveAnim  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!nearby) {
      pulseAnim.setValue(1);
      liveAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.65, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600,  useNativeDriver: true }),
      ]),
    );
    const live = Animated.loop(
      Animated.sequence([
        Animated.timing(liveAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(liveAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    live.start();
    return () => { pulse.stop(); live.stop(); };
  }, [nearby]);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!nearby}
      activeOpacity={0.82}
      style={[s.arRow, nearby && s.arRowActive]}
      accessibilityRole="button"
      accessibilityLabel="AR чиглүүлэгч"
    >
      <View style={s.arIconBox}>
        {nearby && (
          <Animated.View style={[s.arRing, { transform: [{ scale: pulseAnim }] }]} />
        )}
        {nearby ? (
          <LinearGradient
            colors={['#00e0b8', '#00a890']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.arIconInner}
          >
            <Ionicons name="scan-outline" size={20} color="#fff" />
          </LinearGradient>
        ) : (
          <View style={[s.arIconInner, s.arIconInnerDim]}>
            <Ionicons name="scan-outline" size={20} color={AR_TEAL} />
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.arTitle, !nearby && { color: AR_TEAL }]}>AR чиглүүлэгч</Text>
          {nearby && (
            <Animated.View style={[s.arBadge, { opacity: liveAnim }]}>
              <Text style={s.arBadgeText}>LIVE</Text>
            </Animated.View>
          )}
        </View>
        <Text style={s.arHint}>
          {nearby
            ? `${Math.round(distanceM)}м · AR навигаци идэвхтэй`
            : isFinite(distanceM)
              ? `${Math.round(distanceM)}м зайтай · 20м-ийн дотор ороорой`
              : '20м-ийн дотор ойртвол идэвхжинэ'}
        </Text>
      </View>

      {nearby && <Ionicons name="chevron-forward" size={16} color={C.textSec} />}
    </TouchableOpacity>
  );
};

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
    accessibilityRole="button"
    accessibilityLabel={label}
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

const InfoTab = ({ place, openStatus }: { place: Place; openStatus: OpenStatus | null }) => {
  const hoursLines = place.regular_opening_hours?.weekday_descriptions ?? [];
  const address = placeAddress(place);
  const phone = place.phone_national ?? place.phone_intl;
  const { reported, submitting: reportSubmitting, reportClosure } = useClosureReport(place.place_id);
  const { confirmed, submitting: confirmSubmitting, confirmOpen } = useConfirmOpen(place.place_id);

  const showHoursCaveat = openStatus && (
    isStaleStatus(openStatus.kind) || openStatus.kind === 'holiday'
  );

  const handleReport = () => {
    if (reported) return;
    Alert.alert(
      'Хаалттай мэдэгдэх',
      'Энэ газар хаагдсан эсвэл байхгүй болсон гэж мэдэгдэх үү?',
      [
        { text: 'Болих', style: 'cancel' },
        { text: 'Мэдэгдэх', onPress: () => reportClosure() },
      ],
    );
  };

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
          {showHoursCaveat && (
            <View style={s.hoursCaveat}>
              <Ionicons
                name={openStatus.kind === 'holiday' ? 'calendar-outline' : 'alert-circle-outline'}
                size={12}
                color={openStatus.kind === 'holiday' ? '#FBB824' : C.textMuted}
              />
              <Text style={[
                s.hoursCaveatText,
                openStatus.kind === 'holiday' && { color: '#FBB824' },
              ]}>
                {openStatus.kind === 'holiday'
                  ? `${openStatus.holidayName} — цаг хуваарь өөрчлөгдсөн байж болно`
                  : 'Цаг хуваарь сүүлд баталгаажаагүй байна'}
              </Text>
            </View>
          )}
          {phone && <InfoRow icon="call-outline">{phone}</InfoRow>}
        </View>
      )}

      <Div />

      <PlaceMiniMap place={place} />

      {hoursLines.length > 0 && (
        confirmed ? (
          <View style={s.confirmBanner}>
            <Ionicons name="checkmark-circle" size={15} color={C.green} />
            <Text style={[s.confirmBannerText, { color: C.green }]}>
              Нээлттэй байгааг баталгаажууллаа — баярлалаа!
            </Text>
          </View>
        ) : (
          <View style={s.confirmCta}>
            <Text style={s.confirmCtaQuestion}>Одоо нээлттэй байна уу?</Text>
            <TouchableOpacity
              style={s.confirmCtaBtn}
              activeOpacity={0.7}
              disabled={confirmSubmitting}
              onPress={() => confirmOpen()}
            >
              {confirmSubmitting
                ? <ActivityIndicator size="small" color={C.green} />
                : <Ionicons name="thumbs-up-outline" size={14} color={C.green} />
              }
              <Text style={s.confirmCtaBtnText}>Тийм, нээлттэй байна</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      <TouchableOpacity
        style={s.reportBtn}
        activeOpacity={0.6}
        disabled={reported || reportSubmitting}
        onPress={handleReport}
      >
        {reportSubmitting
          ? <ActivityIndicator size="small" color={C.textMuted} />
          : <Ionicons
              name={reported ? 'checkmark-circle-outline' : 'flag-outline'}
              size={13}
              color={reported ? C.green : C.textMuted}
            />
        }
        <Text style={[s.reportBtnText, reported && { color: C.green }]}>
          {reported ? 'Мэдэгдсэн — баярлалаа' : 'Энэ газар хаалттай байна уу?'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const PlaceMiniMap = ({ place }: { place: Place }) => {
  const coord: [number, number] = [place.lng, place.lat];
  const pinColor = CATEGORY_COLORS[place.primary_category ?? ''] ?? FALLBACK_COLOR;
  return (
    <View style={s.miniMap}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MAPBOX_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}
        scrollEnabled={false}
        zoomEnabled={false}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        <MapboxGL.Camera
          centerCoordinate={coord}
          zoomLevel={15}
          animationDuration={0}
        />
        <MapboxGL.StyleImport
          id="basemap"
          existing
          config={{
            showPointOfInterestLabels: false,
            showTransitLabels: false,
            showPlaceLabels: false,
          }}
        />
        <MapboxGL.PointAnnotation id={`mini-${place.place_id}`} coordinate={coord}>
          <View style={[s.miniMapPin, { backgroundColor: pinColor }]}>
            <Ionicons name="location" size={16} color="#fff" />
          </View>
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>
    </View>
  );
};

// ── Tab: Захиалах ─────────────────────────────────────────────────────────────

// Build a Date for 1 hour before a booking (device assumed to be in MNT = UTC+8).
function reminderDate(dateStr: string, timeSlot: string): Date | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeSlot.split(':').map(Number);
  const appointmentMs = new Date(y, m - 1, d, h, min).getTime();
  const reminderMs = appointmentMs - 60 * 60 * 1000;
  return reminderMs > Date.now() ? new Date(reminderMs) : null;
}

const BookTab = ({ place, isBookable }: { place: Place; isBookable: boolean }) => {
  const today = todayDateString();
  // slot_capacity is total covers (sum of party_size) allowed per 30-min slot.
  // DB column is NOT NULL default 8; ?? fallback is a safety net only.
  const slotCapacity = place.slot_capacity ?? 8;
  const hours =
    (place.booking_open_hour != null && place.booking_close_hour != null)
      ? { openHour: place.booking_open_hour, closeHour: place.booking_close_hour }
      : parseTodayHours(place.regular_opening_hours?.weekday_descriptions);
  // Last-seating buffer = typical service duration for this category. A
  // 30-min cut shouldn't be blocked from booking 30 min before close, and
  // a 90-min spa shouldn't be sold a slot that ends after close. Until
  // places.slot_duration_minutes lands, derive from primary_category.
  const slotDurationMinutes = bookingBufferForCategory(place.primary_category);
  const timeSlots = generateTimeSlots(
    hours?.openHour ?? 10,
    hours?.closeHour ?? 20,
    slotDurationMinutes,
  );
  const {
    slots, loadingSlots,
    submitting, initiatingPayment,
    paymentIntent, clearPaymentIntent,
    error, submitted,
    fetchSlots, submitBooking, initiatePaymentBooking, resetSubmitted,
  } = useBooking();
  const { session } = useSupabase();
  const defaultName = session?.user?.user_metadata?.full_name ?? session?.user?.email?.split('@')[0] ?? '';
  const [selectedSlotIdx, setSelectedSlotIdx] = useState(0);
  const [partySize, setPartySize] = useState(2);
  const [guestName, setGuestName] = useState(defaultName);
  const [guestPhone, setGuestPhone] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSucceeded, setPaymentSucceeded] = useState(false);
  const partySizes: Array<string | number> = [1, 2, 3, 4, '5+'];

  useEffect(() => {
    if (isBookable) fetchSlots(place.place_id, today, timeSlots, slotCapacity);
  }, [place.place_id, isBookable]);

  // Re-fetch slots when the user expands the booking form, and every 60s
  // while it's open. Without this, a user who takes 5 minutes to fill in
  // name/phone is acting on stale capacity data — another user could have
  // taken the slot in the meantime. The 60s cadence + on-expand refresh
  // balances accuracy with Supabase RPC quota.
  useEffect(() => {
    if (!isBookable || !showForm) return;
    // Refresh once immediately on expand.
    fetchSlots(place.place_id, today, timeSlots, slotCapacity);
    const id = setInterval(() => {
      fetchSlots(place.place_id, today, timeSlots, slotCapacity);
    }, 60_000);
    return () => clearInterval(id);
    // timeSlots is derived from booking hours (stable) + slotDurationMinutes
    // (category-derived, also stable) — we deliberately do not list it as a
    // dep to avoid a re-fetch storm on every render. slotCapacity is also
    // stable per place. The interval will pick up new slots if the user
    // re-opens the card for a different place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBookable, showForm, place.place_id, today]);

  // Request notification permissions when user opens the booking tab.
  // We surface the *result* in the form copy below so a user with denied
  // permissions sees a hint that the reminder won't fire — silently failing
  // is worse than declining to schedule.
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  useEffect(() => {
    if (!isBookable) return;
    Notifications.requestPermissionsAsync()
      .then(res => {
        // iOS returns granted/denied/undetermined; Android collapses to granted/denied on API 33+.
        const s = res.status === 'granted' ? 'granted'
                : res.status === 'denied'  ? 'denied'
                : 'undetermined';
        setNotifPermission(s);
      })
      .catch(() => setNotifPermission('undetermined'));
  }, [isBookable]);

  const handleConfirm = async () => {
    if (!guestName.trim()) {
      Alert.alert('Нэрээ оруулна уу');
      return;
    }
    const slot = slots[selectedSlotIdx];
    if (!slot?.available) return;

    const needsDeposit = place.deposit_amount != null && place.deposit_amount > 0;

    if (needsDeposit) {
      // Payment flow: create QPay invoice + slot hold, then show PaymentModal
      const intent = await initiatePaymentBooking({
        placeId:    place.place_id,
        date:       today,
        timeSlot:   slot.slot,
        partySize,
        guestName:  guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
      });
      if (intent) setShowPaymentModal(true);
      return;
    }

    // Standard free booking flow (unchanged)
    const ok = await submitBooking({
      placeId:    place.place_id,
      date:       today,
      timeSlot:   slot.slot,
      partySize,
      guestName:  guestName.trim(),
      guestPhone: guestPhone.trim(),
    });

    if (ok) {
      // Schedule a local push notification 1 hour before the appointment.
      // This is best-effort: if the device is off, the app is force-closed,
      // or permissions are denied, the user gets no reminder. We surface the
      // permission state in the form copy and fall back to the server-side
      // SMS reminder (send-reminders cron, which now notifies the guest too).
      if (notifPermission !== 'granted') {
        // Permission denied — server-side SMS reminder (via send-reminders
        // cron + guest_phone) is the only fallback. Do not silently no-op
        // the schedule; the user already knows from the form hint.
        return;
      }
      const trigger = reminderDate(today, slot.slot);
      if (trigger) {
        try {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Захиалга ойртож байна! 🍽️',
              body: `${place.name} · ${slot.slot} цагт ${partySize} хүн`,
            },
            trigger: { date: trigger } as any,
          });
        } catch (e) {
          // Scheduling can fail on iOS if too many notifications are pending
          // (64 limit) or on Android with battery optimizations engaged.
          // Don't block the booking confirmation; the SMS path will cover it.
          console.warn('scheduleNotificationAsync failed:', e);
        }
      }
    }
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

  if (submitted || paymentSucceeded) {
    return (
      <View style={s.emptyState}>
        <View style={[s.emptyIcon, { backgroundColor: 'rgba(251,184,36,0.15)' }]}>
          <Ionicons name="time-outline" size={28} color={C.amber} />
        </View>
        <Text style={[s.emptyTitle, { color: C.amber }]}>Хүсэлт илгээгдлээ</Text>
        <Text style={s.emptyDesc}>
          {slots[selectedSlotIdx]?.slot} цагт {partySize} хүний захиалгын хүсэлт бүртгэгдлээ.
          {'\n\n'}Газар 30 минутын дотор хариу өгнө. Хариу ирмэгц мэдэгдэл хүлээн авна.
        </Text>
        <Text style={[s.emptyDesc, { marginTop: 12 }]}>
          Яаралтай тохиолдолд:{' '}
          <Text
            style={{ color: C.primaryLt, textDecorationLine: 'underline' }}
            onPress={() => Linking.openURL('tel:+97694142121')}
          >
            +976 9414-2121
          </Text>
        </Text>
        <TouchableOpacity
          style={[s.ctaSecondary, { marginTop: 16, alignSelf: 'stretch' }]}
          onPress={() => { resetSubmitted(); setPaymentSucceeded(false); setShowForm(false); fetchSlots(place.place_id, today, timeSlots, slotCapacity); }}
          activeOpacity={0.8}
        >
          <Text style={s.ctaSecondaryText}>Буцах</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Fail closed: until we have a real availability response, every slot is
  // treated as unavailable. The previous "fall back to all-available" path
  // turned a network blip into a double-booking opportunity.
  const slotsTrustworthy = !loadingSlots && !error && slots.length > 0;
  const availableSlots = slotsTrustworthy
    ? slots
    : timeSlots.map(slot => ({ slot, booked: 0, available: false }));
  const selectedSlot = availableSlots[selectedSlotIdx];
  const nextAvailIdx = availableSlots.findIndex(s => s.available);

  const retryFetchSlots = () => fetchSlots(place.place_id, today, timeSlots, slotCapacity);

  // For deposit-required places, unauthenticated users can't pay — show login prompt
  if (place.deposit_amount != null && !session) {
    return (
      <View style={s.emptyState}>
        <View style={s.emptyIcon}>
          <Ionicons name="card-outline" size={22} color={C.amber} />
        </View>
        <Text style={s.emptyTitle}>Нэвтэрнэ үү</Text>
        <Text style={s.emptyDesc}>
          Энэ газар захиалга хийхэд баталгааны төлбөр шаардлагатай.{'\n'}
          Төлбөр хийхийн тулд нэвтэрнэ үү.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {place.deposit_amount != null && place.deposit_amount > 0 && (
        <View style={s.depositBanner}>
          <Ionicons name="card-outline" size={14} color={C.amber} />
          <Text style={s.depositBannerText}>
            Захиалгын баталгааны төлбөр: ₮{place.deposit_amount.toLocaleString()}
          </Text>
        </View>
      )}

      {paymentIntent && (
        <PaymentModal
          visible={showPaymentModal}
          paymentIntent={paymentIntent}
          onSuccess={(_bookingId) => {
            setShowPaymentModal(false);
            clearPaymentIntent();
            setShowForm(false);
            setPaymentSucceeded(true);
          }}
          onExpired={() => {
            setShowPaymentModal(false);
            clearPaymentIntent();
            fetchSlots(place.place_id, today, timeSlots, slotCapacity);
          }}
          onCancel={() => {
            setShowPaymentModal(false);
          }}
        />
      )}

      {error && (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ color: C.red, fontSize: 12, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity onPress={retryFetchSlots} activeOpacity={0.7}>
            <Text style={{ color: C.primaryLt, fontSize: 12, textDecorationLine: 'underline' }}>
              Дахин оролдох
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.nextSlotBanner}>
        <View>
          <Text style={s.nextSlotLabel}>Дараагийн боломжит цаг</Text>
          <Text style={s.nextSlotValue}>
            {loadingSlots
              ? 'Шалгаж байна…'
              : error
                ? 'Боломжит цагийг шалгаж чадсангүй'
                : nextAvailIdx >= 0
                  ? `Өнөөдөр, ${availableSlots[nextAvailIdx].slot}`
                  : 'Өнөөдөр захиалга дүүрсэн'}
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
          {/* If push permission was denied we tell the user explicitly that
              the 1-hour reminder won't appear. The send-reminders cron will
              still SMS them on the number above 60–90 min before — provided
              they entered one. */}
          {notifPermission === 'denied' && (
            <View style={s.permHint}>
              <Ionicons name="notifications-off-outline" size={13} color={C.amber} />
              <Text style={s.permHintText}>
                Push мэдэгдэл хаагдсан байна. {guestPhone.trim()
                  ? 'Та утсаар санамж SMS хүлээж авна.'
                  : 'Утасны дугаараа оруулбал SMS санамж хүлээж авна.'}
              </Text>
            </View>
          )}
          {notifPermission === 'granted' && !guestPhone.trim() && (
            <View style={s.permHint}>
              <Ionicons name="information-circle-outline" size={13} color={C.textSec} />
              <Text style={[s.permHintText, { color: C.textSec }]}>
                Утсаа оруулбал SMS санамж нэмж хүлээн авна.
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[s.ctaPrimary, (!selectedSlot?.available || submitting || initiatingPayment) && { opacity: 0.5 }]}
            activeOpacity={0.85}
            disabled={!selectedSlot?.available || submitting || initiatingPayment}
            onPress={handleConfirm}
          >
            {(submitting || initiatingPayment)
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.ctaPrimaryText}>
                  {place.deposit_amount != null ? 'Төлбөр хийх' : 'Захиалгыг баталгаажуулах'}
                </Text>
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
  const { session } = useSupabase();
  const defaultName = session?.user?.user_metadata?.full_name ?? session?.user?.email?.split('@')[0] ?? '';
  const [name, setName] = useState(defaultName);
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
      {count > 0 && (
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
      )}

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

interface PlaceDetailCardProps {
  place: Place | null;
  loading: boolean;
  onClose: () => void;
  onRequestDirections?: (place: Place) => void;
  userLocation?: [number, number] | null;
  onRequestAR?: (place: Place) => void;
}

export function PlaceDetailCard({ place, loading, onClose, onRequestDirections, userLocation, onRequestAR }: PlaceDetailCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<'info' | 'book' | 'reviews'>('info');
  const { isSaved, toggle: toggleSaved } = useSavedPlaces();
  const saved = place ? isSaved(place.place_id) : false;

  const handleToggleSave = useCallback(async () => {
    if (!place) return;
    const ok = await toggleSaved(place.place_id);
    if (!ok) Alert.alert('Хадгалж чадсангүй');
  }, [place?.place_id, toggleSaved]);

  const handleShare = useCallback(async () => {
    if (!place) return;
    const address = placeAddress(place);
    const geoUrl = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
    const message = `${place.name}${address ? `\n${address}` : ''}\n${geoUrl}`;
    try {
      await Share.share({ message, title: place.name, url: geoUrl });
    } catch (e) {
      Alert.alert('Хуваалцаж чадсангүй');
    }
  }, [place?.place_id]);

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
  const openStatus: OpenStatus | null = place ? getOpenStatus(place) : null;
  const isBookable = place?.booking_enabled === true;
  const phone = place?.phone_national ?? place?.phone_intl;

  const distanceM = (userLocation && place)
    ? haversineMeters(userLocation, [place.lng, place.lat])
    : Infinity;
  const nearbyAR = isFinite(distanceM) && distanceM <= AR_NEARBY_THRESHOLD;
  const walkMins = nearbyAR ? Math.max(1, Math.round(distanceM / 70)) : 0;

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
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Агшаах' : 'Дэлгэх'}
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
              {catLabel && openStatus && (
                <Text style={s.metaDot}>·</Text>
              )}
              {openStatus && (
                <View style={[s.statusBadge, { backgroundColor: openStatus.badgeBg }]}>
                  <Text style={[s.statusText, { color: openStatus.textColor }]}>
                    {openStatus.label}
                  </Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => setExpanded(p => !p)}
                style={s.chevronBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Агшаах' : 'Дэлгэх'}
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
          <QuickBtn
            icon="navigate-outline"
            label="Чиглэл"
            highlight
            onPress={() => onRequestDirections?.(place)}
          />
          <QuickBtn
            icon="call-outline"
            label="Залгах"
            onPress={() => phone && Linking.openURL('tel:' + phone.replace(/\s/g, ''))}
          />
          <QuickBtn
            icon={saved ? 'bookmark' : 'bookmark-outline'}
            label="Хадгалах"
            highlight={saved}
            onPress={handleToggleSave}
          />
          <QuickBtn icon="share-outline" label="Хуваалцах" onPress={handleShare} />
        </View>
      )}

      {expanded && place && (
        <View style={s.expandedContent}>
          <Div />

          {place.has_ar_navigation && (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
              <ARLiveViewSection
                nearby={nearbyAR}
                distanceM={distanceM}
                walkMins={walkMins}
                onPress={() => onRequestAR?.(place)}
              />
            </View>
          )}

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
            {tab === 'info'    && <InfoTab place={place} openStatus={openStatus} />}
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
  arRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(0,212,168,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,168,0.14)',
  },
  arRowActive: {
    backgroundColor: 'rgba(0,212,168,0.11)',
    borderColor: 'rgba(0,212,168,0.32)',
    shadowColor: '#00d4a8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 4,
  },
  arIconBox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  arRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0,212,168,0.22)',
  },
  arIconInner: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arIconInnerDim: {
    borderWidth: 1,
    borderColor: 'rgba(0,212,168,0.22)',
    backgroundColor: 'rgba(0,212,168,0.08)',
  },
  arTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.2,
  },
  arHint: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
  },
  arBadge: {
    backgroundColor: '#00d4a8',
    borderRadius: 999,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  arBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
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
    height: 160,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  miniMapPin: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  miniMapLabel: {
    fontSize: 9,
    color: C.textMuted,
    letterSpacing: 1,
  },

  depositBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251,184,36,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251,184,36,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  depositBannerText: {
    flex: 1,
    fontSize: 12,
    color: C.amber,
    fontWeight: '600',
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

  // Inline hint under the phone input — explains the reminder fallback path
  // when push permission is denied, or nudges the user to enter a phone
  // number so they get the SMS path. Compact and non-blocking by design.
  permHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    marginTop: -4,
  },
  permHintText: {
    flex: 1,
    fontSize: 11,
    color: C.amber,
    lineHeight: 15,
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

  hoursCaveat: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    paddingLeft: 26,
  },
  hoursCaveatText: {
    fontSize: 11,
    color: C.textMuted,
    flex: 1,
    lineHeight: 16,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    opacity: 0.65,
  },
  reportBtnText: {
    fontSize: 12,
    color: C.textMuted,
  },

  confirmCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(16,185,129,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  confirmCtaQuestion: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '500',
  },
  confirmCtaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16,185,129,0.14)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  confirmCtaBtnText: {
    fontSize: 12,
    color: C.green,
    fontWeight: '600',
  },
  confirmBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  confirmBannerText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
