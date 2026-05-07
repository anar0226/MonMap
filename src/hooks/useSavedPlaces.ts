import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { Place } from '../types/place';

const SAVED_PLACES_KEY = 'monmap.saved_places';

/**
 * Manages the user's saved-place IDs (persisted to AsyncStorage).
 * Also resolves IDs → full Place objects from Supabase.
 */
export function useSavedPlaces() {
  const [ids, setIds] = useState<string[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load saved IDs on mount
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
      const parsed: string[] = raw ? JSON.parse(raw) : [];
      setIds(parsed);

      if (parsed.length > 0) {
        const { data, error: dbError } = await supabase
          .from('places')
          .select('place_id, name, primary_category, lat, lng, formatted_address, short_address, phone_intl, phone_national, regular_opening_hours, current_opening_hours, rating, user_rating_count, website_uri, business_status, hours_verified_at')
          .in('place_id', parsed);
        if (dbError) throw dbError;
        // Sort in the same order as saved order (most recent last)
        const placeMap = new Map((data ?? []).map((p: any) => [p.place_id, p as Place]));
        setPlaces(parsed.map(id => placeMap.get(id)).filter(Boolean) as Place[]);
      } else {
        setPlaces([]);
      }
    } catch (e: any) {
      console.warn('useSavedPlaces: reload failed', e);
      setError('Хадгалсан газрууд ачаалагдсангүй');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const isSaved = useCallback((placeId: string) => ids.includes(placeId), [ids]);

  const toggle = useCallback(async (placeId: string): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
      const current: string[] = raw ? JSON.parse(raw) : [];
      const next = current.includes(placeId)
        ? current.filter(id => id !== placeId)
        : [...current, placeId];
      await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
      setIds(next);
      // Trigger a full reload so places list is in sync
      await reload();
      return true;
    } catch (e: any) {
      console.warn('useSavedPlaces: toggle failed', e);
      setError('Хадгалж чадсангүй');
      return false;
    }
  }, [reload]);

  const remove = useCallback(async (placeId: string): Promise<boolean> => {
    try {
      const raw = await AsyncStorage.getItem(SAVED_PLACES_KEY);
      const current: string[] = raw ? JSON.parse(raw) : [];
      const next = current.filter(id => id !== placeId);
      await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
      setIds(next);
      setPlaces(prev => prev.filter(p => p.place_id !== placeId));
      return true;
    } catch (e: any) {
      console.warn('useSavedPlaces: remove failed', e);
      setError('Устгаж чадсангүй');
      return false;
    }
  }, []);

  return { ids, places, loading, error, count: ids.length, isSaved, toggle, remove, reload };
}
