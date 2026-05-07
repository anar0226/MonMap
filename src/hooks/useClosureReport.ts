import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'monmap.closure_reports';

export function useClosureReport(placeId: string) {
  const [reported, setReported] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setReported(ids.includes(placeId));
    }).catch(() => {});
  }, [placeId]);

  const reportClosure = useCallback(async (): Promise<boolean> => {
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return false;

      const { error } = await supabase
        .from('place_closure_reports')
        .insert({ place_id: placeId, user_id: userId });
      // Unique-violation = user already reported this place. Treat as success
      // so the UI flips to "reported" instead of erroring loudly.
      if (error && error.code !== '23505') throw error;
      const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, placeId]));
      setReported(true);
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [placeId]);

  return { reported, submitting, reportClosure };
}
