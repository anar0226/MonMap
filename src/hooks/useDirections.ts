import { useState, useCallback, useMemo } from 'react';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { NavStep } from '../lib/navigation';
import type { TransitLeg } from '../types/transit';
import {
  type TransportMode,
  type PriceEstimate,
  ubcabPrice,
  abaPrice,
  escooterPrice,
  transitPrice,
  walkingPrice,
} from '../lib/transport';

const MAPBOX_TOKEN     = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN!;
const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export type Congestion = 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe';

export interface ModeRoute {
  mode: TransportMode;
  durationSeconds: number;
  durationTypicalSeconds: number | null;
  distanceMeters: number;
  segments: FeatureCollection<LineString, { congestion: Congestion }>;
  bounds: { sw: [number, number]; ne: [number, number] };
  steps: NavStep[];
  price: PriceEstimate | null;
  /** Populated only for mode === 'transit' */
  transitLegs?: TransitLeg[];
}

export interface MultiRoute {
  modes: Partial<Record<TransportMode, ModeRoute>>;
  selectedMode: TransportMode;
  destination: [number, number];
  origin: [number, number];
}

interface MapboxRouteResult {
  durationSeconds: number;
  durationTypicalSeconds: number | null;
  distanceMeters: number;
  segments: FeatureCollection<LineString, { congestion: Congestion }>;
  bounds: { sw: [number, number]; ne: [number, number] };
  steps: NavStep[];
}

// ── Mapbox directions ──────────────────────────────────────────────────────
async function fetchMapboxRoute(
  profile: 'driving-traffic' | 'walking' | 'cycling',
  from: [number, number],
  to: [number, number],
): Promise<MapboxRouteResult | null> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const annotations = profile === 'driving-traffic' ? 'congestion,duration,distance' : 'duration,distance';
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}` +
    `?annotations=${annotations}` +
    `&geometries=geojson` +
    `&overview=full` +
    `&steps=true` +
    `&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const r = json?.routes?.[0];
    if (!r) return null;

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

    const rawSteps = r.legs?.[0]?.steps ?? [];
    const steps: NavStep[] = rawSteps.map((s: any) => ({
      maneuver: {
        type: s.maneuver?.type ?? 'continue',
        modifier: s.maneuver?.modifier,
        instruction: s.maneuver?.instruction,
        location: s.maneuver?.location as [number, number],
        bearing_before: s.maneuver?.bearing_before,
        bearing_after: s.maneuver?.bearing_after,
        exit: s.maneuver?.exit,
      },
      name: s.name ?? '',
      distance: s.distance ?? 0,
      duration: s.duration ?? 0,
      geometry: s.geometry,
    }));

    return {
      durationSeconds: r.duration,
      durationTypicalSeconds: r.duration_typical ?? null,
      distanceMeters: r.distance,
      segments: { type: 'FeatureCollection', features },
      bounds: { sw: [minLng, minLat], ne: [maxLng, maxLat] },
      steps,
    };
  } catch {
    return null;
  }
}

// ── Transit route via Edge Function ───────────────────────────────────────
interface TransitRouteResult {
  legs: TransitLeg[];
  fetchedAt: string;
}

async function fetchTransitRoute(
  from: [number, number],
  to: [number, number],
): Promise<TransitRouteResult | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/transit-route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        from_lng: from[0],
        from_lat: from[1],
        to_lng: to[0],
        to_lat: to[1],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json?.legs)) return null;
    return json as TransitRouteResult;
  } catch {
    return null;
  }
}

/** Build a GeoJSON FeatureCollection from a [lng,lat][] polyline. */
function polylineToSegments(
  coords: [number, number][],
): FeatureCollection<LineString, { congestion: Congestion }> {
  const features: Feature<LineString, { congestion: Congestion }>[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    features.push({
      type: 'Feature',
      properties: { congestion: 'unknown' },
      geometry: { type: 'LineString', coordinates: [coords[i], coords[i + 1]] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Compute a bounding box from an array of [lng,lat] coordinates. */
function coordsBounds(
  coords: [number, number][],
): { sw: [number, number]; ne: [number, number] } {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { sw: [minLng, minLat], ne: [maxLng, maxLat] };
}

// ── Hook ───────────────────────────────────────────────────────────────────
export function useDirections() {
  const [multi, setMulti] = useState<MultiRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoute = useCallback(async (
    from: [number, number],
    to: [number, number],
  ) => {
    setLoading(true);
    setError(null);
    try {
      // Fire all fetches concurrently; transit is best-effort
      const [driving, walking, cycling, transitResult] = await Promise.all([
        fetchMapboxRoute('driving-traffic', from, to),
        fetchMapboxRoute('walking', from, to),
        fetchMapboxRoute('cycling', from, to),
        fetchTransitRoute(from, to),
      ]);

      if (!driving) {
        throw new Error('Маршрут олдсонгүй');
      }

      const modes: Partial<Record<TransportMode, ModeRoute>> = {};

      modes.driving = {
        mode: 'driving',
        durationSeconds: driving.durationSeconds,
        durationTypicalSeconds: driving.durationTypicalSeconds,
        distanceMeters: driving.distanceMeters,
        segments: driving.segments,
        bounds: driving.bounds,
        steps: driving.steps,
        price: null,
      };

      modes.ubcab = {
        mode: 'ubcab',
        durationSeconds: driving.durationSeconds,
        durationTypicalSeconds: driving.durationTypicalSeconds,
        distanceMeters: driving.distanceMeters,
        segments: driving.segments,
        bounds: driving.bounds,
        steps: [],
        price: ubcabPrice(driving.distanceMeters),
      };

      modes.aba = {
        mode: 'aba',
        durationSeconds: driving.durationSeconds,
        durationTypicalSeconds: driving.durationTypicalSeconds,
        distanceMeters: driving.distanceMeters,
        segments: driving.segments,
        bounds: driving.bounds,
        steps: [],
        price: abaPrice(driving.distanceMeters),
      };

      // Transit: use real USCC data if available, otherwise omit the mode entirely
      if (transitResult && transitResult.legs.length > 0) {
        const bestLeg = transitResult.legs[0];
        // Build polyline from the best leg; fall back to straight line
        const polyCoords: [number, number][] =
          bestLeg.polyline.length > 0
            ? bestLeg.polyline
            : [
                [bestLeg.boardStop.lng, bestLeg.boardStop.lat],
                [bestLeg.alightStop.lng, bestLeg.alightStop.lat],
              ];

        const allCoords: [number, number][] = [
          [from[0], from[1]],
          ...polyCoords,
          [to[0], to[1]],
        ];

        // Total distance: walk-to-stop + ride distance + walk-from-stop
        const WALK_SPEED_MPS = 1.3;
        const AVG_BUS_MPS    = 5.5;
        const rideDist = bestLeg.rideSec * AVG_BUS_MPS;
        const walkDist = (bestLeg.walkToStopSec + bestLeg.walkFromStopSec) * WALK_SPEED_MPS;

        modes.transit = {
          mode: 'transit',
          durationSeconds: bestLeg.totalSec,
          durationTypicalSeconds: null,
          distanceMeters: Math.round(rideDist + walkDist),
          segments: polylineToSegments(polyCoords),
          bounds: coordsBounds(allCoords),
          steps: [],
          price: transitPrice(),
          transitLegs: transitResult.legs,
        };
      }
      // If transit Edge Function returned nothing, 'transit' is simply absent from modes.

      if (walking) {
        modes.walking = {
          mode: 'walking',
          durationSeconds: walking.durationSeconds,
          durationTypicalSeconds: null,
          distanceMeters: walking.distanceMeters,
          segments: walking.segments,
          bounds: walking.bounds,
          steps: walking.steps,
          price: walkingPrice(),
        };
      }

      if (cycling) {
        modes.escooter = {
          mode: 'escooter',
          durationSeconds: cycling.durationSeconds,
          durationTypicalSeconds: null,
          distanceMeters: cycling.distanceMeters,
          segments: cycling.segments,
          bounds: cycling.bounds,
          steps: cycling.steps,
          price: escooterPrice(cycling.durationSeconds),
        };
      }

      setMulti({ modes, selectedMode: 'driving', destination: to, origin: from });
    } catch (e: any) {
      setError(e?.message ?? 'Чиглэл олдсонгүй');
      setMulti(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectMode = useCallback((m: TransportMode) => {
    setMulti(prev => (prev && prev.modes[m] ? { ...prev, selectedMode: m } : prev));
  }, []);

  const clear = useCallback(() => {
    setMulti(null);
    setError(null);
  }, []);

  const route = useMemo<ModeRoute | null>(
    () => (multi ? multi.modes[multi.selectedMode] ?? null : null),
    [multi],
  );

  return { multi, route, loading, error, fetchRoute, selectMode, clear };
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
