import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Place } from '../types/place';

const DETAIL_COLUMNS = [
  'place_id', 'name', 'primary_category',
  'lat', 'lng', 'formatted_address', 'short_address',
  'phone_intl', 'phone_national',
  'regular_opening_hours', 'current_opening_hours',
  'rating', 'user_rating_count',
  'website_uri', 'business_status', 'slot_capacity',
  'booking_open_hour', 'booking_close_hour',
  'hours_verified_at',
].join(', ');

export function usePlaceDetail() {
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async (placeId: string) => {
    setPlace(null);
    setLoading(true);
    try {
      const { data } = await supabase
        .from('places')
        .select(DETAIL_COLUMNS)
        .eq('place_id', placeId)
        .single();
      setPlace(data as Place | null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setPlace(null);
    setLoading(false);
  }, []);

  return { place, loading, fetchDetail, clear };
}
