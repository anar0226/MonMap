import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export interface QPayBankLink {
  name: string;
  description?: string;
  logo: string;
  link: string;
}

export interface PaymentIntentData {
  paymentId: string;
  holdId: string;
  holdExpiresAt: string;
  amount: number;
  qpayQrImage: string;
  qpayUrls: QPayBankLink[];
}

export interface SlotAvailability {
  slot: string;
  booked: number;
  available: boolean;
  remaining: number;
}

export function useBooking() {
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [initiatingPayment, setInitiatingPayment] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState<PaymentIntentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Idempotency key for the in-flight payment-intent request. Generated lazily
  // on first attempt and reused across retries within the same booking flow,
  // so a network timeout followed by a re-tap doesn't create a duplicate slot
  // hold + QPay invoice on the server. Cleared when the modal is dismissed
  // (clearPaymentIntent), so the next "Confirm" press starts fresh.
  const idempotencyKeyRef = useRef<string | null>(null);

  const fetchSlots = useCallback(async (
    placeId: string,
    date: string,
    timeSlots: string[],
    slotCapacity: number,
  ) => {
    setLoadingSlots(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('bookings')
        .select('time_slot, party_size')
        .eq('place_id', placeId)
        .eq('booked_date', date)
        .neq('status', 'cancelled');
      if (err) throw err;

      // Sum covers (party_size) per slot, not booking count.
      // slot_capacity is a covers limit, so 8 means 8 seated guests, not 8 bookings.
      const coversBySlot: Record<string, number> = {};
      for (const row of (data ?? [])) {
        coversBySlot[row.time_slot] = (coversBySlot[row.time_slot] ?? 0) + (row.party_size ?? 1);
      }

      setSlots(timeSlots.map(slot => {
        const booked = coversBySlot[slot] ?? 0;
        return {
          slot,
          booked,
          available: booked < slotCapacity,
          remaining: Math.max(0, slotCapacity - booked),
        };
      }));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load availability');
    } finally {
      setLoadingSlots(false);
    }
  }, []);

  const submitBooking = useCallback(async (params: {
    placeId: string;
    date: string;
    timeSlot: string;
    partySize: number;
    guestName: string;
    guestPhone: string;
  }): Promise<boolean> => {
    setSubmitting(true);
    setError(null);
    setSubmitted(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        setError('Захиалга үүсгэхийн тулд нэвтэрнэ үү');
        return false;
      }

      // Cheap client-side bounds. The DB enforces these too — these just
      // give a friendlier error than a Postgres check_violation.
      if (params.partySize < 1 || params.partySize > 50) {
        setError('Хүний тоо 1-50 байх ёстой');
        return false;
      }
      const today = todayDateString();
      if (params.date < today) {
        setError('Захиалгын огноо өнөөдрөөс хойш байх ёстой');
        return false;
      }

      // Validate against fetched slot capacity
      const slotData = slots.find(s => s.slot === params.timeSlot);
      if (slotData && params.partySize > slotData.remaining) {
        setError(`Энэ цагт ${slotData.remaining} хүний сул суудал байна.`);
        return false;
      }

<<<<<<< HEAD
      // Atomic capacity check + insert. See migration
      // 20260518000001_create_booking_atomic.sql — the previous direct
      // INSERT had no slot-capacity enforcement, so two concurrent users
      // could each book the same remaining covers.
      const { data: bookingId, error: err } = await supabase.rpc('create_booking', {
        p_place_id:     params.placeId,
        p_booked_date:  params.date,
        p_time_slot:    params.timeSlot,
        p_party_size:   params.partySize,
        p_guest_name:   params.guestName,
        p_guest_phone:  params.guestPhone || null,
      });
      if (err) throw err;

      // Fire-and-forget: notify the business owner of a new booking request.
      // Don't await — a Twilio failure must never block the UX.
      if (bookingId) {
        supabase.functions
          .invoke('notify-booking', { body: { bookingId } })
          .catch((e) => console.warn('notify-booking:', e));
      }

      setSubmitted(true);
      return true;
    } catch (e: any) {
      const msg = e?.message ?? 'Could not submit booking';
      if (msg.includes('slot_full')) {
        setError('Уучлаарай, энэ цаг захиалгаар дүүрсэн байна.');
      } else if (msg.includes('duplicate key') || msg.includes('unique constraint')) {
        setError('Та энэ цагт аль хэдийн захиалга хийсэн байна.');
      } else {
        setError('Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.');
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [slots]);

  const initiatePaymentBooking = useCallback(async (params: {
    placeId: string;
    date: string;
    timeSlot: string;
    partySize: number;
    guestName: string;
    guestPhone?: string;
    service?: string;
    durationMinutes?: number;
  }): Promise<PaymentIntentData | null> => {
    setInitiatingPayment(true);
    setError(null);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey();
      }
      const { data, error: err } = await supabase.functions.invoke('create-payment-intent', {
        body: {
          idempotencyKey:  idempotencyKeyRef.current,
          placeId:         params.placeId,
          date:            params.date,
          timeSlot:        params.timeSlot,
          partySize:       params.partySize,
          guestName:       params.guestName,
          guestPhone:      params.guestPhone ?? null,
          service:         params.service ?? null,
          durationMinutes: params.durationMinutes ?? null,
        },
      });
      if (err) throw err;
      if (data?.error === 'slot_full') {
        setError(data.message ?? 'Уучлаарай, энэ цаг захиалгаар дүүрсэн байна.');
        return null;
      }
      if (data?.error === 'idempotency_key_stale') {
        // The prior hold tied to this key has expired. Reset the key so the
        // next attempt creates a fresh hold + invoice.
        idempotencyKeyRef.current = null;
        setError(data.message ?? 'Захиалгын хугацаа дууссан байна. Дахин оролдоно уу.');
        return null;
      }
      const intent = data as PaymentIntentData;
      setPaymentIntent(intent);
      return intent;
    } catch (e: any) {
      setError('Төлбөрийн мэдээлэл бэлдэхэд алдаа гарлаа. Дахин оролдоно уу.');
      return null;
    } finally {
      setInitiatingPayment(false);
    }
  }, []);

  const clearPaymentIntent = useCallback(() => {
    setPaymentIntent(null);
    idempotencyKeyRef.current = null;
  }, []);

  const resetSubmitted = useCallback(() => setSubmitted(false), []);

  return {
    slots, loadingSlots,
    submitting, initiatingPayment,
    paymentIntent, clearPaymentIntent,
    error, submitted,
    fetchSlots, submitBooking, initiatePaymentBooking, resetSubmitted,
  };
}

// Parses today's open/close hours from Google Places weekday_descriptions.
// weekday_descriptions index 0 = Monday … 6 = Sunday.
// Returns null on "Closed", unparseable strings, or missing data → caller falls back to defaults.
export function parseTodayHours(
  weekdayDescriptions: string[] | null | undefined,
): { openHour: number; closeHour: number } | null {
  if (!weekdayDescriptions?.length) return null;
  const todayIdx = (new Date().getDay() + 6) % 7;
  const line = weekdayDescriptions[todayIdx];
  if (!line) return null;
  if (/closed/i.test(line)) return null;
  if (/open 24 hours/i.test(line)) return { openHour: 0, closeHour: 24 };

  // AM/PM format: "9:00 AM – 5:00 PM" (possibly multiple ranges for split shifts)
  const ampmMatches = [...line.matchAll(/(\d{1,2}):(\d{2})\s*(AM|PM)/gi)];
  if (ampmMatches.length >= 2) {
    const toH = (h: string, ap: string) => {
      const n = parseInt(h, 10);
      if (ap.toUpperCase() === 'AM') return n === 12 ? 0 : n;
      return n === 12 ? 12 : n + 12;
    };
    const openHour = toH(ampmMatches[0][1], ampmMatches[0][3]);
    const closeHour = toH(ampmMatches[ampmMatches.length - 1][1], ampmMatches[ampmMatches.length - 1][3]);
    // "6:00 PM – 12:00 AM" → closeHour=0, treat midnight closing as 24
    return { openHour, closeHour: closeHour <= openHour ? 24 : closeHour };
  }

  // 24h format: "09:00 – 18:00"
  const h24Matches = [...line.matchAll(/\b(\d{1,2}):(\d{2})\b/g)];
  if (h24Matches.length >= 2) {
    const openHour = parseInt(h24Matches[0][1], 10);
    const closeHour = parseInt(h24Matches[h24Matches.length - 1][1], 10);
    return { openHour, closeHour: closeHour <= openHour ? 24 : closeHour };
  }

  return null;
}

/**
 * Generate bookable time slots between openHour and closeHour.
 *
 * The bookings table indexes `time_slot` at 30-min granularity, so the
 * stride is always 30 min — that is a schema invariant, not a tuning knob.
 *
 * `slotDurationMinutes` controls the *last-seating buffer*: the latest
 * slot generated must be able to finish by closeHour. Previously this was
 * hard-coded to 60, which was wrong for both ends of the spectrum:
 *   - a barber running 30-min haircuts lost the final two slots for no
 *     reason (could finish a 30-min cut before close);
 *   - a spa running 90-min massages could sell a slot that ran past close.
 *
 * Pass the typical/maximum service duration as the third arg and the math
 * works out for both cases.
 *
 *   generateTimeSlots(10, 20)        → 60-min buffer (pre-existing default)
 *   generateTimeSlots(10, 20, 30)    → 30-min buffer (haircut shop)
 *   generateTimeSlots(10, 20, 90)    → 90-min buffer (spa)
 */
export function generateTimeSlots(
  openHour = 10,
  closeHour = 20,
  slotDurationMinutes = 60,
): string[] {
  const STRIDE_MINUTES = 30;   // schema invariant — see top-of-function note
  const slots: string[] = [];
  const startMins = openHour * 60;
  const endMins   = closeHour * 60;
  // Last slot must finish by close.
  const lastStart = endMins - Math.max(STRIDE_MINUTES, slotDurationMinutes);

  for (let m = startMins; m <= lastStart; m += STRIDE_MINUTES) {
    const h  = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return slots;
}

// Returns today's date in Asia/Ulaanbaatar (UTC+8, no DST) as YYYY-MM-DD.
// Using toISOString() returns UTC, which between 16:00–24:00 UTC is the
// previous calendar day in Mongolia — so date-equality checks against
// booked_date must use this function, not CURRENT_DATE in the DB.
export function todayDateString(): string {
  const mnt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return mnt.toISOString().split('T')[0];
}

// crypto.randomUUID is available on Hermes/JSC in recent RN; the timestamp
// fallback is more than unique enough for per-user idempotency within the
// 10-min hold window — the DB unique index is scoped to (user_id, key).
function generateIdempotencyKey(): string {
  const c: any = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
