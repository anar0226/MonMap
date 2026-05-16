// Referral attribution helpers.
//
// Flow:
//   1. Anywhere the app boots from a deep link (?ref=<token>) or finds the
//      token on the clipboard, call captureReferralToken(token). The token
//      is persisted via AsyncStorage so it survives an install→signup gap.
//   2. After successful sign-up / sign-in, call claimPendingReferral(). If a
//      stored token exists, we POST it to referral-claim and clear local
//      storage on completion (whether awarded or rejected — we don't retry).
//
// Token format is the 12-char base32 produced by eta-share-create. We accept
// 8–32 chars defensively in case the format changes.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const STORAGE_KEY  = 'monmap.pending_referral_token';
const TOKEN_REGEX  = /^[A-Z2-9]{8,32}$/;

function isValidToken(t: unknown): t is string {
  return typeof t === 'string' && TOKEN_REGEX.test(t);
}

export async function captureReferralToken(token: string): Promise<boolean> {
  if (!isValidToken(token)) return false;
  try {
    // First-writer-wins: don't overwrite a previously captured token. This
    // matters because a returning installer's clipboard might contain an
    // unrelated string.
    const existing = await AsyncStorage.getItem(STORAGE_KEY);
    if (existing) return false;
    await AsyncStorage.setItem(STORAGE_KEY, token);
    return true;
  } catch {
    return false;
  }
}

export async function getStoredReferralToken(): Promise<string | null> {
  try {
    const t = await AsyncStorage.getItem(STORAGE_KEY);
    return isValidToken(t) ? t : null;
  } catch {
    return null;
  }
}

export async function clearReferralToken(): Promise<void> {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
}

/**
 * Look for a referral token in the OS clipboard (e.g. user installed from a
 * share link, copied the token, opened app). Per Apple's HIG we should not
 * read silently in production — call this from a screen where the user has
 * just consented or where the clipboard prompt is acceptable.
 *
 * Returns the token if it looked like ours, null otherwise.
 */
export async function pickupTokenFromClipboard(): Promise<string | null> {
  try {
    const raw = (await Clipboard.getStringAsync()).trim();
    // Accept either a bare token or a URL containing ?ref=<token>.
    const match = raw.match(/(?:[?&]ref=)?([A-Z2-9]{12})/);
    const t = match?.[1];
    return isValidToken(t) ? t : null;
  } catch {
    return null;
  }
}

export interface ReferralClaimResult {
  awarded: boolean;
  referralId?: string;
  reason?: string;
}

/**
 * If a token is stored, claim it via the referral-claim edge function. Clears
 * the stored token in all terminal outcomes (success or rejection) so we don't
 * keep retrying a token we already know is invalid.
 */
export async function claimPendingReferral(): Promise<ReferralClaimResult | null> {
  const token = await getStoredReferralToken();
  if (!token) return null;

  const { data: sess } = await supabase.auth.getSession();
  const jwt = sess.session?.access_token;
  if (!jwt) return null;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/referral-claim`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      // 400/404 from the edge function — token bad, stop retrying.
      if (res.status === 400 || res.status === 404) {
        await clearReferralToken();
      }
      return null;
    }

    const json = (await res.json()) as ReferralClaimResult;
    await clearReferralToken();
    return json;
  } catch {
    // Network/transient — leave the token stored for a future attempt.
    return null;
  }
}
