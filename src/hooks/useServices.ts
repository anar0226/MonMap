import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// One service row, as written by the portal's services.html. We only read the
// columns the booking UI cares about — `buffer_minutes` and `description`
// exist server-side too but they don't change what the booker picks.
export interface PlaceService {
  id: string;
  name: string;
  duration_minutes: number | null;
  price: number | null;
  deposit: number | null;
  max_capacity: number | null;
  is_active: boolean | null;
}

// Fetch the (active) services configured for a place. The portal scopes
// services by `place_id`, so we mirror that here — there's no
// per-place-per-business-id indirection on the mobile side.
//
// Behaviour:
//   - Empty list is a normal state (place hasn't configured services yet);
//     the booking UI falls back to a single generic slot.
//   - A query failure is surfaced as `error` but does NOT block booking —
//     the caller can still submit with `service=null` (which the bookings
//     table accepts).
export function useServices(placeId: string | null | undefined) {
  const [services, setServices] = useState<PlaceService[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('services')
        .select('id, name, duration_minutes, price, deposit, max_capacity, is_active')
        .eq('place_id', id)
        .neq('is_active', false)
        .order('created_at', { ascending: true });
      if (err) throw err;
      setServices((data ?? []) as PlaceService[]);
    } catch (e: any) {
      // Don't blow up the booking flow on a services lookup failure — log,
      // keep the previous list, and let the UI render the "no services
      // configured" fallback.
      console.warn('useServices fetch failed:', e?.message ?? e);
      setError(e?.message ?? 'Could not load services');
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (placeId) fetch(placeId);
  }, [placeId, fetch]);

  return { services, loading, error, refetch: () => placeId && fetch(placeId) };
}
