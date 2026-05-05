import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'monmap.open_confirmations';

export function useConfirmOpen(placeId: string) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      const ids: string[] = raw ? JSON.parse(raw) : [];
      setConfirmed(ids.includes(placeId));
    }).catch(() => {});
  }, [placeId]);

  const confirmOpen = useCallback(async (): Promise<boolean> => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('place_open_confirmations')
        .insert({ place_id: placeId });
      if (error) throw error;
      const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      const ids: string[] = raw ? JSON.parse(raw) : [];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, placeId]));
      setConfirmed(true);
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  }, [placeId]);

  return { confirmed, submitting, confirmOpen };
}
