import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { claimPendingReferral } from '../lib/referral';

interface SupabaseContextType {
  session: Session | null;
  isLoading: boolean;
  needsName: boolean;
  refreshProfile: () => Promise<void>;
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsName, setNeedsName] = useState(false);

  async function computeNeedsName(userId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();
    if (__DEV__ && error) console.warn('[SupabaseContext] needsName query error:', error);
    return !data?.full_name;
  }

  // Apply session + needsName together so RootNavigator never renders a
  // transient (session=true, needsName=false) frame between the two updates.
  async function applySession(next: Session | null) {
    const flag = next?.user?.id ? await computeNeedsName(next.user.id) : false;
    setSession(next);
    setNeedsName(flag);
  }

  async function refreshProfile() {
    const { data: { session: s } } = await supabase.auth.getSession();
    setNeedsName(s?.user?.id ? await computeNeedsName(s.user.id) : false);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await applySession(session);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  // Register push token whenever a session is established so notify-guest can reach this device.
  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== 'granted') return;
        const tokenData = await Notifications.getExpoPushTokenAsync();
        await supabase
          .from('user_push_tokens')
          .upsert(
            { user_id: session.user.id, token: tokenData.data, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' },
          );
      } catch {
        // Non-fatal — push notifications are best-effort.
      }
    })();
  }, [session?.user?.id]);

  // Claim any pending referral token captured before sign-up. The redeem RPC
  // enforces "invitee is brand-new" so re-running on a returning user is safe.
  useEffect(() => {
    if (!session?.user?.id) return;
    claimPendingReferral().catch(() => {});
  }, [session?.user?.id]);

  return (
    <SupabaseContext.Provider value={{ session, isLoading, needsName, refreshProfile }}>
      {children}
    </SupabaseContext.Provider>
  );
}

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (context === undefined) {
    throw new Error('useSupabase must be used within SupabaseProvider');
  }
  return context;
}

export { supabase };
