import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface SlotAvailability {
  slot: string;
  booked: number;
  available: boolean;
}

export function useBooking() {
  const [slots, setSlots] = useState<SlotAvailability[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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

      setSlots(timeSlots.map(slot => ({
        slot,
        booked: coversBySlot[slot] ?? 0,
        available: (coversBySlot[slot] ?? 0) < slotCapacity,
      })));
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
      const userId = session?.user?.id ?? null;

      const { data, error: err } = await supabase
        .from('bookings')
        .insert({
          place_id: params.placeId,
          booked_date: params.date,
          time_slot: params.timeSlot,
          party_size: params.partySize,
          guest_name: params.guestName,
          guest_phone: params.guestPhone || null,
          status: 'pending',
          ...(userId ? { user_id: userId } : {}),
        })
        .select('id')
        .single();
      if (err) throw err;

      // Fire-and-forget: notify the business owner of a new booking request.
      // Don't await — a Twilio failure must never block the UX.
      if (data?.id) {
        supabase.functions
          .invoke('notify-booking', { body: { bookingId: data.id } })
          .catch((e) => console.warn('notify-booking:', e));
      }

      setSubmitted(true);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit booking');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const resetSubmitted = useCallback(() => setSubmitted(false), []);

  return { slots, loadingSlots, submitting, error, submitted, fetchSlots, submitBooking, resetSubmitted };
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

export function generateTimeSlots(openHour = 10, closeHour = 20, lastSeatingMinutesBefore = 60): string[] {
  const slots: string[] = [];
  const cutoffMins = closeHour * 60 - lastSeatingMinutesBefore;
  for (let h = openHour; h < closeHour; h++) {
    if (h * 60 <= cutoffMins) slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h * 60 + 30 <= cutoffMins) slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

export function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}
