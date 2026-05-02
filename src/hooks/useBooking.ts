import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SLOT_CAPACITY = 8;

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
  const [confirmed, setConfirmed] = useState(false);

  const fetchSlots = useCallback(async (
    placeId: string,
    date: string,
    timeSlots: string[],
  ) => {
    setLoadingSlots(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('bookings')
        .select('time_slot')
        .eq('place_id', placeId)
        .eq('booked_date', date)
        .neq('status', 'cancelled');
      if (err) throw err;

      const bookedCounts: Record<string, number> = {};
      for (const row of (data ?? [])) {
        bookedCounts[row.time_slot] = (bookedCounts[row.time_slot] ?? 0) + 1;
      }

      setSlots(timeSlots.map(slot => ({
        slot,
        booked: bookedCounts[slot] ?? 0,
        available: (bookedCounts[slot] ?? 0) < SLOT_CAPACITY,
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
    setConfirmed(false);
    try {
      const { error: err } = await supabase
        .from('bookings')
        .insert({
          place_id: params.placeId,
          booked_date: params.date,
          time_slot: params.timeSlot,
          party_size: params.partySize,
          guest_name: params.guestName,
          guest_phone: params.guestPhone || null,
          status: 'confirmed',
        });
      if (err) throw err;
      setConfirmed(true);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit booking');
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const resetConfirmed = useCallback(() => setConfirmed(false), []);

  return { slots, loadingSlots, submitting, error, confirmed, fetchSlots, submitBooking, resetConfirmed };
}

export function generateTimeSlots(openHour = 10, closeHour = 20): string[] {
  const slots: string[] = [];
  for (let h = openHour; h < closeHour; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

export function todayDateString(): string {
  return new Date().toISOString().split('T')[0];
}
