import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { FeatureCollection, Point } from 'geojson';
import type { PlaceMapFeature } from '../types/place';

const MAP_COLUMNS = 'place_id, name, primary_category, rating, lat, lng';

export function usePlaces() {
  const [geojson, setGeojson] = useState<FeatureCollection<Point, PlaceMapFeature> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('places')
          .select(MAP_COLUMNS);

        if (err) throw err;
        if (cancelled) return;

        const features = (data ?? []).map((row: any) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [row.lng, row.lat] as [number, number] },
          properties: {
            place_id: row.place_id,
            name: row.name,
            primary_category: row.primary_category,
            rating: row.rating,
          },
        }));

        setGeojson({ type: 'FeatureCollection', features });
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { geojson, loading, error };
}
