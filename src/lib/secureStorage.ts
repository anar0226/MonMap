// Secure session storage for Supabase auth.
//
// Supabase persists the full session blob (access token + refresh token + user
// metadata) under a single storage key. On Android, expo-secure-store rejects
// values larger than ~2 KB because Keystore-backed SharedPreferences uses a
// per-entry size cap. The blob is typically 2–4 KB.
//
// This adapter wraps expo-secure-store with transparent chunking:
//
//   getItem(key)        →  read manifest "<key>", then read chunks
//                          "<key>__chunk_0", "<key>__chunk_1", ... and concat
//   setItem(key, value) →  if value <= CHUNK_SIZE, write a single entry with
//                          manifest "<key>" = "v1:plain:<value>"
//                          otherwise split into N pieces and write manifest
//                          "<key>" = "v1:chunks:N", chunks "<key>__chunk_i"
//   removeItem(key)     →  read manifest to get N, then remove every chunk
//                          and finally the manifest
//
// The manifest's `v1:` prefix is a forward-compat marker — if we ever change
// the chunk size or encoding we can branch on the prefix. Reads of legacy
// values written before this adapter existed are migrated transparently on
// first read (see `migrateLegacyAsyncStorage` below).
//
// Why not just write the whole thing to AsyncStorage when it's too big?
// Because the previous design did exactly that — the session sat unencrypted
// on disk and was recoverable on a rooted/jailbroken device. Chunking lets us
// keep the entire value inside Keychain (iOS) / EncryptedSharedPreferences
// (Android), which is the actual hardening goal.

import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Android API floor for hardware-backed encryption.
//
// expo-secure-store uses EncryptedSharedPreferences (AES-GCM with a
// Keystore-backed master key) starting at API 23. Below that, it silently
// falls back to *plaintext* SharedPreferences — defeating the entire reason
// we migrated off AsyncStorage. Expo SDK 54 defaults to minSdkVersion 24
// (Android 7.0), so under normal install paths this branch never fires;
// the guard is here so that:
//   (a) if a future Expo SDK upgrade lowers the floor we don't quietly
//       regress the security guarantee, and
//   (b) if anyone manually overrides minSdkVersion in app.json or via
//       expo-build-properties we still catch it in __DEV__.
//
// On unsupported devices we fall back to plain AsyncStorage, which puts us
// no worse off than the pre-secureStorage baseline. Sign-in still works.
const ANDROID_SECURE_FLOOR_API = 23;
const isAndroidSecureCapable =
  Platform.OS !== 'android' || (typeof Platform.Version === 'number' && Platform.Version >= ANDROID_SECURE_FLOOR_API);

if (__DEV__ && !isAndroidSecureCapable) {
  console.warn(
    `secureStorage: Android API ${Platform.Version} < ${ANDROID_SECURE_FLOOR_API}; ` +
    'session blob will be stored in AsyncStorage (plaintext). Upgrade Android or ' +
    'raise app.json android.minSdkVersion to 24.',
  );
}

// Conservative chunk size — Android's hard cap is ~2048 bytes, but Base64
// safety margin and the manifest overhead leave us ~1800 bytes of payload.
// iOS Keychain is much more generous; using the same size keeps the code
// platform-agnostic and writes are still fast (<5 ms per chunk).
const CHUNK_SIZE = 1800;

const MANIFEST_PREFIX = 'v1:';
const PLAIN_TAG       = 'plain:';
const CHUNKS_TAG      = 'chunks:';

function chunkKey(key: string, i: number): string {
  return `${key}__chunk_${i}`;
}

// SecureStore keys must match [A-Za-z0-9._-]. Supabase's default storage key
// is `sb-<project>-auth-token`, which already complies — but we sanitize as
// a defensive measure in case a caller passes something exotic.
function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function readChunked(rawKey: string): Promise<string | null> {
  const key = sanitizeKey(rawKey);
  const manifest = await SecureStore.getItemAsync(key);
  if (manifest === null) return null;

  if (!manifest.startsWith(MANIFEST_PREFIX)) {
    // Unknown format — refuse rather than corrupt. This should never happen
    // in practice; if it does we log and treat the key as missing so auth
    // can re-prompt for credentials.
    if (__DEV__) console.warn(`secureStorage: unknown manifest format for "${rawKey}"`);
    return null;
  }
  const body = manifest.slice(MANIFEST_PREFIX.length);

  if (body.startsWith(PLAIN_TAG)) {
    return body.slice(PLAIN_TAG.length);
  }
  if (body.startsWith(CHUNKS_TAG)) {
    const count = Number(body.slice(CHUNKS_TAG.length));
    if (!Number.isFinite(count) || count <= 0) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) {
        // A chunk went missing — the value is unrecoverable. Treat as absent.
        if (__DEV__) console.warn(`secureStorage: chunk ${i}/${count} missing for "${rawKey}"`);
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  }
  return null;
}

async function writeChunked(rawKey: string, value: string): Promise<void> {
  const key = sanitizeKey(rawKey);

  // Clear any prior chunks first — a previous write may have used more chunks
  // than this one needs, and orphaned chunks waste Keychain entries.
  await removeChunked(rawKey);

  if (value.length <= CHUNK_SIZE) {
    await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${PLAIN_TAG}${value}`);
    return;
  }

  const count = Math.ceil(value.length / CHUNK_SIZE);
  // Write chunks first, manifest last — a partial write that fails after
  // some chunks but before the manifest leaves orphaned chunks (cleaned up
  // on the next setItem call), but never leaves a manifest pointing at
  // missing chunks (which would surface as a "looks logged in but fails on
  // refresh" bug).
  for (let i = 0; i < count; i++) {
    const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await SecureStore.setItemAsync(chunkKey(key, i), slice);
  }
  await SecureStore.setItemAsync(key, `${MANIFEST_PREFIX}${CHUNKS_TAG}${count}`);
}

async function removeChunked(rawKey: string): Promise<void> {
  const key = sanitizeKey(rawKey);
  const manifest = await SecureStore.getItemAsync(key);
  if (manifest && manifest.startsWith(MANIFEST_PREFIX + CHUNKS_TAG)) {
    const count = Number(manifest.slice((MANIFEST_PREFIX + CHUNKS_TAG).length));
    if (Number.isFinite(count) && count > 0) {
      for (let i = 0; i < count; i++) {
        await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
      }
    }
  }
  await SecureStore.deleteItemAsync(key).catch(() => {});
}

// One-time migration from the pre-adapter design where the session blob lived
// in AsyncStorage in plain text. Called on first read; if a value exists in
// AsyncStorage but not in SecureStore, we copy it over and then nuke the
// AsyncStorage copy. After everyone's logged in once on the new build this
// path is dead — but it's the only way to avoid forcing every existing user
// to re-authenticate on upgrade.
async function migrateLegacyIfNeeded(rawKey: string): Promise<string | null> {
  try {
    const legacy = await AsyncStorage.getItem(rawKey);
    if (legacy === null) return null;
    if (__DEV__) console.log(`secureStorage: migrating "${rawKey}" from AsyncStorage`);
    await writeChunked(rawKey, legacy);
    await AsyncStorage.removeItem(rawKey).catch(() => {});
    return legacy;
  } catch (e) {
    if (__DEV__) console.warn('secureStorage: migration failed', e);
    return null;
  }
}

/**
 * Supabase-compatible storage adapter. Pass this to `createClient(..., {
 * auth: { storage: secureStorage } })`. Operations are async and never
 * throw — Supabase treats throws as "storage unavailable" and falls back
 * to an in-memory session, which silently logs the user out on app
 * restart. Returning null is the recoverable path.
 */
// On Android < API 23, SecureStore is structurally insecure (see floor
// comment at the top of this file). We route all reads/writes to
// AsyncStorage instead — same plain-disk profile as the pre-migration
// baseline, but at least the user can sign in. The dev warning above
// surfaces this so it doesn't slip past review.
const asyncFallback = {
  async getItem(key: string): Promise<string | null> {
    try { return await AsyncStorage.getItem(key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    try { await AsyncStorage.setItem(key, value); } catch {}
  },
  async removeItem(key: string): Promise<void> {
    try { await AsyncStorage.removeItem(key); } catch {}
  },
};

export const secureStorage = isAndroidSecureCapable ? {
  async getItem(key: string): Promise<string | null> {
    try {
      const fromSecure = await readChunked(key);
      if (fromSecure !== null) return fromSecure;
      return await migrateLegacyIfNeeded(key);
    } catch (e) {
      if (__DEV__) console.warn(`secureStorage.getItem("${key}")`, e);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await writeChunked(key, value);
    } catch (e) {
      if (__DEV__) console.warn(`secureStorage.setItem("${key}")`, e);
      // Last-resort fallback: write to AsyncStorage so the session at least
      // survives a reload. This downgrades security back to the previous
      // baseline rather than locking the user out entirely. Only happens
      // if SecureStore is structurally unavailable (e.g. simulator quirk).
      try { await AsyncStorage.setItem(key, value); } catch {}
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await removeChunked(key);
    } catch (e) {
      if (__DEV__) console.warn(`secureStorage.removeItem("${key}")`, e);
    }
    // Clean up any legacy copy too — covers the migration path's edge case
    // where setItem races a sign-out.
    try { await AsyncStorage.removeItem(key); } catch {}
  },
} : asyncFallback;
