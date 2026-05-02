import { useState, useCallback } from 'react';
import type { Feature, FeatureCollection, LineString } from 'geojson';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN!;

export type Congestion = 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe';

export interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
  durationTypicalSeconds: number | null;
}

export interface RouteResult {
  summary: RouteSummary;
  segments: FeatureCollection<LineString, { congestion: Congestion }>;
  bounds: { sw: [number, number]; ne: [number, number] };
}

export function useDirections() {
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoute = useCallback(async (
    from: [number, number],
    to: [number, number],
  ) => {
    setLoading(true);
    setError(null);
    try {
      const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}` +
        `?annotations=congestion,duration,distance` +
        `&geometries=geojson` +
        `&overview=full` +
        `&steps=false` +
        `&access_token=${MAPBOX_TOKEN}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Directions API error ${res.status}`);
      const json = await res.json();

      const r = json?.routes?.[0];
      if (!r) throw new Error('Маршрут олдсонгүй');

      const coordinates: [number, number][] = r.geometry.coordinates;
      const congestion: Congestion[] = r.legs?.[0]?.annotation?.congestion ?? [];

      const features: Feature<LineString, { congestion: Congestion }>[] = [];
      for (let i = 0; i < coordinates.length - 1; i++) {
        features.push({
          type: 'Feature',
          properties: { congestion: (congestion[i] as Congestion) ?? 'unknown' },
          geometry: { type: 'LineString', coordinates: [coordinates[i], coordinates[i + 1]] },
        });
      }

      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      for (const [lng, lat] of coordinates) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }

      setRoute({
        summary: {
          distanceMeters: r.distance,
          durationSeconds: r.duration,
          durationTypicalSeconds: r.duration_typical ?? null,
        },
        segments: { type: 'FeatureCollection', features },
        bounds: { sw: [minLng, minLat], ne: [maxLng, maxLat] },
      });
    } catch (e: any) {
      setError(e?.message ?? 'Чиглэл олдсонгүй');
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setRoute(null);
    setError(null);
  }, []);

  return { route, loading, error, fetchRoute, clear };
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs} ц` : `${hrs} ц ${rem} мин`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} км`;
}
