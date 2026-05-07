import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  cacheGet,
  cacheSet,
  PLACES_KEY,
  PLACES_TTL_MS,
} from '../lib/offlineCache';
import type { FeatureCollection, Point } from 'geojson';
import type { PlaceMapFeature } from '../types/place';

const MAP_COLUMNS = 'place_id, name, primary_category, rating, lat, lng, closure_report_count, short_address, address_searchable';

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

/**
 * Fetch all places from Supabase with cache-first offline support.
 *
 * Strategy:
 *  1. Immediately serve the AsyncStorage cache (< 24 h old) if available.
 *  2. In parallel, try to refresh from the network.
 *  3. On success, update both state and the cache.
 *  4. On network failure, if we already showed cached data, clear the
 *     error so the user doesn't see a misleading red banner.
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
      if (cached && !cancelled) {
        setGeojson(cached);
        setFromCache(true);
        setLoading(false);
        // Don't return — still try to refresh from network silently
      }

      // ── Step 2: Fetch from Supabase ────────────────────────────────────
      try {
        const PAGE = 1000;
        let all: any[] = [];
        let offset = 0;

        while (true) {
          const { data, error: err } = await supabase
            .from('places')
            .select(MAP_COLUMNS)
            .lt('closure_report_count', 10)
            .range(offset, offset + PAGE - 1);

          if (err) throw err;
          if (cancelled) return;

          all = all.concat(data ?? []);
          if ((data ?? []).length < PAGE) break;
          offset += PAGE;
        }

        const freshGeojson = rowsToGeojson(all);

        if (!cancelled) {
          setGeojson(freshGeojson);
          setFromCache(false);
          setError(null);
        }

        // Persist even if cancelled — the data is still valid
        await cacheSet(PLACES_KEY, freshGeojson);
      } catch (e: any) {
        if (cancelled) return;

        // If we already have cached data, don't show an error banner —
        // the user has a map. Just suppress silently.
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
