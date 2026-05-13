import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Session tokens at rest:
// We persist the Supabase session (access + refresh JWT) via `secureStorage`,
// a chunked adapter over expo-secure-store. On iOS this puts the blob in the
// Keychain; on Android it lands in EncryptedSharedPreferences (backed by
// the Android Keystore). The chunking layer transparently handles the 2 KB
// per-entry cap that previously blocked this approach.
//
// Migration: an existing AsyncStorage session (from before this change) is
// copied over on first read and then deleted, so existing users do not need
// to re-authenticate on upgrade. See src/lib/secureStorage.ts.
//
// Threat reduction vs. the previous AsyncStorage design:
//   • Plain disk reads from another app sandbox or USB debug: blocked.
//     Both Keychain and EncryptedSharedPreferences are encrypted at rest.
//   • Rooted/jailbroken device with elevated privileges: still recoverable.
//     This is a platform-level limitation, not something app code can fix —
//     RLS remains the authoritative data boundary.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
