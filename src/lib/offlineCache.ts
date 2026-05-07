/**
 * offlineCache.ts
 *
 * Thin wrapper around AsyncStorage for caching network responses.
 * Used by usePlaces, usePlaceDetail, and useDirections to serve
 * stale data when the device is offline (ger district / basement / concrete walls).
 *
 * Storage format: { data: T, cachedAt: number (ms epoch) }
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'monmap_cache:';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

/**
 * Write a value to the cache.
 */
export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Storage errors are non-fatal — we silently skip.
  }
}

/**
 * Read a value from the cache.
 * @param maxAgeMs  Return null if the entry is older than this. Omit for no TTL.
 */
export async function cacheGet<T>(
  key: string,
  maxAgeMs?: number,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (maxAgeMs !== undefined && Date.now() - entry.cachedAt > maxAgeMs) {
      return null; // stale
    }
    return entry.data;
  } catch {
    return null;
  }
}

/**
 * Return the cache entry's age in milliseconds, or null if not cached.
 */
export async function cacheAge(key: string): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<unknown> = JSON.parse(raw);
    return Date.now() - entry.cachedAt;
  } catch {
    return null;
  }
}

/**
 * Delete a cache entry.
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {}
}

// ── Well-known cache keys ──────────────────────────────────────────────────

/**
 * Full places GeoJSON (stale-while-revalidate, TTL 24 h).
 * Suffix is bumped whenever PlaceMapFeature gains a new field so old cached
 * payloads are ignored on first run after an upgrade.
 *   v2 — added address_searchable for Mongolian structured-address search.
 */
export const PLACES_KEY = 'places_geojson:v2';
export const PLACES_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/** Place detail keyed by place_id (TTL 6 h) */
export const placeDetailKey = (id: string) => `place_detail:${id}`;
export const DETAIL_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

/**
 * Route cache key.
 * We round coords to 4 decimal places (~11 m) so minor GPS jitter
 * doesn't create duplicate cache entries.
 */
export const routeKey = (
  from: [number, number],
  to: [number, number],
) =>
  `route:${from[0].toFixed(4)},${from[1].toFixed(4)}→${to[0].toFixed(4)},${to[1].toFixed(4)}`;

export const ROUTE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
