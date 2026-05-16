import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  cacheGet,
  cacheSet,
  placeDetailKey,
  DETAIL_TTL_MS,
} from '../lib/offlineCache';
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
  'district', 'khoroo', 'khoroolol',
  'building_number', 'entrance_number', 'unit_number',
  'booking_enabled',
].join(', ');

/**
 * Fetches a single place's detail with cache-first offline support.
 *
 * On tap: serve cached detail immediately if available (< 6 h),
 * then silently revalidate from Supabase. If offline and no cache
 * exists, the card will remain in its loading state until the
 * network returns.
 */
export function usePlaceDetail() {
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(false);
  const [fromCache, setFromCache] = useState(false);

  const fetchDetail = useCallback(async (placeId: string) => {
    setPlace(null);
    setLoading(true);
    setFromCache(false);

    const key = placeDetailKey(placeId);

    // ── Try cache first ────────────────────────────────────────────────
    const cached = await cacheGet<Place>(key, DETAIL_TTL_MS);
    if (cached) {
      setPlace(cached);
      setFromCache(true);
      setLoading(false);
      // Still attempt a background refresh — don't await, fall through
    }

    // ── Fetch from Supabase ────────────────────────────────────────────
    try {
      const { data } = await supabase
        .from('places')
        .select(DETAIL_COLUMNS)
        .eq('place_id', placeId)
        .single();

      if (data) {
        setPlace(data as unknown as Place);
        setFromCache(false);
        // Update cache with fresh data
        await cacheSet(key, data as unknown as Place);
      }
    } catch {
      // Network failure — if cached data was already set, keep showing it.
      // If no cache: loading will be false, place will be null → card shows nothing.
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setPlace(null);
    setLoading(false);
    setFromCache(false);
  }, []);

  return { place, loading, fromCache, fetchDetail, clear };
}
