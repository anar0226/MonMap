import { useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import {
  cacheGet,
  cacheSet,
  PLACES_KEY,
  PLACES_TTL_MS,
} from '../lib/offlineCache';
import { UB_CENTER } from '../constants/config';
import type { FeatureCollection, Point } from 'geojson';
import type { PlaceMapFeature } from '../types/place';

const MAP_COLUMNS = 'place_id, name, primary_category, rating, lat, lng, closure_report_count, short_address, address_searchable';

// Rough bounding box around Ulaanbaatar (~100km). Used to decide whether the
// device's last known location is plausibly inside our data region — outside it
// (e.g. an emulator in the USA) we fall back to UB_CENTER so the user sees
// places immediately instead of an empty bbox.
const UB_REGION = {
  minLat: 46.5, maxLat: 49.5,
  minLng: 105.5, maxLng: 108.5,
};

// Stage 1 bbox radius in degrees. ~0.025° ≈ 2.8 km at this latitude — large
// enough to cover the default zoom-16 viewport plus a generous buffer.
const STAGE1_RADIUS_DEG = 0.025;

type PlacesGeoJSON = FeatureCollection<Point, PlaceMapFeature>;

function rowsToGeojson(rows: any[]): PlacesGeoJSON {
  const features = rows.map((row: any) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] as [number, number] },
    properties: {
      place_id: row.place_id,
      name: row.name,
      primary_category: row.primary_category,
      rating: row.rating,
      closure_report_count: row.closure_report_count ?? 0,
      short_address: row.short_address ?? null,
      address_searchable: row.address_searchable ?? null,
    },
  }));
  return { type: 'FeatureCollection', features };
}

function isInUBRegion(coord: [number, number]): boolean {
  const [lng, lat] = coord;
  return (
    lat >= UB_REGION.minLat && lat <= UB_REGION.maxLat &&
    lng >= UB_REGION.minLng && lng <= UB_REGION.maxLng
  );
}

async function resolvePriorityCenter(): Promise<[number, number]> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      const coord: [number, number] = [last.coords.longitude, last.coords.latitude];
      if (isInUBRegion(coord)) return coord;
    }
  } catch {
    // permission denied or location unavailable — fall through
  }
  return UB_CENTER;
}

/**
 * Fetch places from Supabase with cache-first offline support and
 * viewport-first progressive loading.
 *
 * Strategy:
 *  1. Immediately serve the AsyncStorage cache (< 24 h old) if available.
 *  2. On cache miss, do a fast bbox fetch around the user's location (or
 *     UB_CENTER fallback) so on-screen places appear in < 1 s.
 *  3. In the background, paginate the full dataset, merging each page into
 *     state so distant places fill in progressively.
 *  4. On full-fetch success, replace state and persist to cache.
 *  5. On network failure, if we already showed cached or stage-1 data, clear
 *     the error so the user doesn't see a misleading red banner.
 */
export function usePlaces() {
  const [geojson, setGeojson] = useState<PlacesGeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // ── Step 1: Try the cache first ────────────────────────────────────
      const cached = await cacheGet<PlacesGeoJSON>(PLACES_KEY, PLACES_TTL_MS);
      const hasCache = cached !== null;
      if (hasCache && !cancelled) {
        setGeojson(cached);
        setFromCache(true);
        setLoading(false);
      }

      try {
        // ── Step 2: Stage-1 bbox fetch (only when cache is empty) ──────
        // When cache is warm we already show all places; a smaller stage-1
        // set would be a visible regression. Skip it.
        const seen = new Set<string>();
        let accumulated: any[] = [];

        if (!hasCache) {
          const center = await resolvePriorityCenter();
          const [lng, lat] = center;

          const { data: stage1, error: stage1Err } = await supabase
            .from('places')
            .select(MAP_COLUMNS)
            .lt('closure_report_count', 10)
            .gte('lat', lat - STAGE1_RADIUS_DEG)
            .lte('lat', lat + STAGE1_RADIUS_DEG)
            .gte('lng', lng - STAGE1_RADIUS_DEG)
            .lte('lng', lng + STAGE1_RADIUS_DEG);

          if (stage1Err) throw stage1Err;
          if (cancelled) return;

          accumulated = stage1 ?? [];
          for (const r of accumulated) seen.add(r.place_id);

          if (accumulated.length > 0 && !cancelled) {
            setGeojson(rowsToGeojson(accumulated));
            setLoading(false);
          }
        }

        // ── Step 3: Stage-2 full paginated fetch ──────────────────────
        const PAGE = 1000;
        let offset = 0;

        while (true) {
          const { data, error: err } = await supabase
            .from('places')
            .select(MAP_COLUMNS)
            .lt('closure_report_count', 10)
            .range(offset, offset + PAGE - 1);

          if (err) throw err;
          if (cancelled) return;

          const page = data ?? [];

          if (!hasCache) {
            // Progressive merge: only emit rows we haven't shown yet, so
            // each setGeojson is a strict superset of the previous frame.
            const newRows = page.filter((r: any) => !seen.has(r.place_id));
            for (const r of newRows) seen.add(r.place_id);
            if (newRows.length > 0) {
              accumulated = accumulated.concat(newRows);
              if (!cancelled) setGeojson(rowsToGeojson(accumulated));
            }
          } else {
            // Cache-hit path: accumulate silently, replace once at the end
            // to avoid flashing fewer markers than the cache was showing.
            accumulated = accumulated.concat(page);
          }

          if (page.length < PAGE) break;
          offset += PAGE;
        }

        const freshGeojson = rowsToGeojson(accumulated);

        if (!cancelled) {
          setGeojson(freshGeojson);
          setFromCache(false);
          setError(null);
        }

        await cacheSet(PLACES_KEY, freshGeojson);
      } catch (e: any) {
        if (cancelled) return;

        // If we already painted something (cache or stage-1), don't show a
        // red banner — the user has a usable map.
        if (!geojson) {
          setError(e?.message ?? 'Unknown error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { geojson, loading, error, fromCache };
}
