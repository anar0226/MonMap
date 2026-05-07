import { useState, useCallback, useMemo } from 'react';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { NavStep } from '../lib/navigation';
import type { TransitLeg } from '../types/transit';
import {
  type TransportMode,
  type PriceEstimate,
  escooterPrice,
  transitPrice,
  walkingPrice,
} from '../lib/transport';
import {
  cacheGet,
  cacheSet,
  routeKey,
  ROUTE_TTL_MS,
} from '../lib/offlineCache';
import { distanceMeters } from '../lib/navigation';

const MAPBOX_TOKEN      = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN!;
const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
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
  /** True when this route was loaded from cache or generated offline */
  isOffline?: boolean;
  /**
   * Driving-only: Mapbox's alternative routes, sorted by duration ASC.
   * The currently-active route is NOT included here (only the others).
   * Tap one in DirectionsPanel to swap it into the primary slot.
   */
  alternatives?: AlternativeRoute[];
}

/**
 * Slimmer version of ModeRoute for non-active alternatives.
 * Includes everything needed to display + swap into the primary slot.
 */
export interface AlternativeRoute {
  durationSeconds: number;
  durationTypicalSeconds: number | null;
  distanceMeters: number;
  segments: FeatureCollection<LineString, { congestion: Congestion }>;
  bounds: { sw: [number, number]; ne: [number, number] };
  steps: NavStep[];
}

export interface MultiRoute {
  modes: Partial<Record<TransportMode, ModeRoute>>;
  selectedMode: TransportMode;
  destination: [number, number];
  origin: [number, number];
  /** True when served from cache or straight-line fallback */
  isOffline?: boolean;
}

/** Serialisable snapshot stored in AsyncStorage */
interface CachedMultiRoute {
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
/**
 * Convert a single Mapbox `routes[i]` element into our internal route shape.
 */
function _shapeRoute(r: any): MapboxRouteResult {
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
}

/**
 * Fetch a route from Mapbox.  When `wantAlternatives` is true (only sensible
 * for driving), returns up to 3 routes sorted by current-traffic duration.
 */
async function fetchMapboxRoute(
  profile: 'driving-traffic' | 'walking' | 'cycling',
  from: [number, number],
  to: [number, number],
  wantAlternatives = false,
): Promise<MapboxRouteResult[] | null> {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const annotations = profile === 'driving-traffic' ? 'congestion,duration,distance' : 'duration,distance';
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}` +
    `?annotations=${annotations}` +
    `&geometries=geojson` +
    `&overview=full` +
    `&steps=true` +
    (wantAlternatives ? `&alternatives=true` : '') +
    `&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const routes: any[] = json?.routes ?? [];
    if (routes.length === 0) return null;

    const shaped = routes.map(_shapeRoute);
    // Sort fastest-first by current-traffic duration so we always pick
    // the actually-fastest route, not just whatever Mapbox returned at index 0.
    shaped.sort((a, b) => a.durationSeconds - b.durationSeconds);
    return shaped;
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

// ── Offline helpers ───────────────────────────────────────────────────────

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

/**
 * Generate a straight-line (as-the-crow-flies) route when fully offline.
 * This gives the user something to look at and navigate by rather than
 * a blank screen. Walking speed ~4.5 km/h.
 */
function buildStraightLineRoute(
  from: [number, number],
  to: [number, number],
): Partial<Record<TransportMode, ModeRoute>> {
  const dist = distanceMeters(from, to);
  const walkingSpeedMps = 1.25; // 4.5 km/h
  const drivingSpeedMps = 8.33; // 30 km/h urban avg

  const coords: [number, number][] = [from, to];
  const segments = polylineToSegments(coords);
  const bounds = coordsBounds(coords);

  const departStep: NavStep = {
    maneuver: {
      type: 'depart',
      location: from,
      instruction: 'Замаар хөдөлнө',
    },
    name: '',
    distance: dist,
    duration: dist / walkingSpeedMps,
    geometry: { type: 'LineString', coordinates: coords },
  };
  const arriveStep: NavStep = {
    maneuver: {
      type: 'arrive',
      location: to,
      instruction: 'Хүрэх газартаа хүрлээ',
    },
    name: '',
    distance: 0,
    duration: 0,
    geometry: { type: 'LineString', coordinates: [to, to] },
  };

  const walkDuration = Math.round(dist / walkingSpeedMps);
  const driveDuration = Math.round(dist / drivingSpeedMps);

  const modes: Partial<Record<TransportMode, ModeRoute>> = {
    driving: {
      mode: 'driving',
      durationSeconds: driveDuration,
      durationTypicalSeconds: null,
      distanceMeters: dist,
      segments,
      bounds,
      steps: [departStep, arriveStep],
      price: null,
      isOffline: true,
    },
    walking: {
      mode: 'walking',
      durationSeconds: walkDuration,
      durationTypicalSeconds: null,
      distanceMeters: dist,
      segments,
      bounds,
      steps: [departStep, arriveStep],
      price: walkingPrice(),
      isOffline: true,
    },
    escooter: {
      mode: 'escooter',
      durationSeconds: Math.round(walkDuration * 0.5),
      durationTypicalSeconds: null,
      distanceMeters: dist,
      segments,
      bounds,
      steps: [departStep, arriveStep],
      price: escooterPrice(walkDuration * 0.5),
      isOffline: true,
    },
  };

  return modes;
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

    const cacheK = routeKey(from, to);

    try {
      // ── Step 1: Serve cached route immediately if < 12 h old ─────────
      const cached = await cacheGet<CachedMultiRoute>(cacheK, ROUTE_TTL_MS);
      if (cached) {
        // Show cached immediately while we try to refresh
        setMulti({ ...cached, isOffline: true });
      }

      // ── Step 2: Try to fetch fresh routes concurrently ────────────────
      // Only driving asks for alternatives — walking/cycling rarely have
      // meaningful alternatives, and Mapbox is faster without the flag.
      const [drivingRoutes, walkingRoutes, cyclingRoutes, transitResult] = await Promise.all([
        fetchMapboxRoute('driving-traffic', from, to, /* alternatives */ true),
        fetchMapboxRoute('walking', from, to),
        fetchMapboxRoute('cycling', from, to),
        fetchTransitRoute(from, to),
      ]);

      const driving = drivingRoutes?.[0] ?? null;
      const walking = walkingRoutes?.[0] ?? null;
      const cycling = cyclingRoutes?.[0] ?? null;

      if (!driving) {
        // Network failure — if we served a cache, keep it; else use straight-line
        if (!cached) {
          const modes = buildStraightLineRoute(from, to);
          setMulti({ modes, selectedMode: 'driving', destination: to, origin: from, isOffline: true });
          setError('Офлайн горим: шулуун чиглэл харагдаж байна');
        }
        // If cached was set above, it's already shown — no error needed
        return;
      }

      // ── Step 3: Build the full mode map ──────────────────────────────
      const modes: Partial<Record<TransportMode, ModeRoute>> = {};

      // Build alternatives list — every shaped route except the primary (index 0).
      const drivingAlts: AlternativeRoute[] =
        (drivingRoutes ?? []).slice(1).map(r => ({
          durationSeconds: r.durationSeconds,
          durationTypicalSeconds: r.durationTypicalSeconds,
          distanceMeters: r.distanceMeters,
          segments: r.segments,
          bounds: r.bounds,
          steps: r.steps,
        }));

      modes.driving = {
        mode: 'driving',
        durationSeconds: driving.durationSeconds,
        durationTypicalSeconds: driving.durationTypicalSeconds,
        distanceMeters: driving.distanceMeters,
        segments: driving.segments,
        bounds: driving.bounds,
        steps: driving.steps,
        price: null,
        alternatives: drivingAlts.length > 0 ? drivingAlts : undefined,
      };

      if (transitResult && transitResult.legs.length > 0) {
        const bestLeg = transitResult.legs[0];
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

        const WALK_SPEED_MPS = 1.3;
        const AVG_BUS_MPS    = 5.5;
        const rideDist = bestLeg.rideSec * AVG_BUS_MPS;
        const walkDist = (bestLeg.walkToStopSec + bestLeg.walkFromStopSec) * WALK_SPEED_MPS;

        // Build NavSteps so the existing useNavigation hook can drive
        // turn-by-turn for transit.  Four steps:
        //   depart (walk to board stop) → board (bus) → alight (bus stop) → arrive
        const boardLoc:  [number, number] = [bestLeg.boardStop.lng,  bestLeg.boardStop.lat];
        const alightLoc: [number, number] = [bestLeg.alightStop.lng, bestLeg.alightStop.lat];
        const boardStopName  = bestLeg.boardStop.nameMn  || bestLeg.boardStop.nameEn;
        const alightStopName = bestLeg.alightStop.nameMn || bestLeg.alightStop.nameEn;

        const transitSteps: NavStep[] = [
          {
            maneuver: {
              type: 'depart',
              instruction: `${bestLeg.routeNo} автобусны ${boardStopName} зогсоол руу алхах`,
              location: from,
            },
            name: '',
            distance: bestLeg.boardStopDistM,
            duration: bestLeg.walkToStopSec,
            geometry: {
              type: 'LineString',
              coordinates: [from, boardLoc],
            },
          },
          {
            maneuver: {
              type: 'board',
              location: boardLoc,
            },
            // streetName slot carries the bus number — translateManeuver reads it.
            name:     bestLeg.routeNo,
            distance: Math.round(rideDist),
            duration: bestLeg.rideSec,
            geometry: { type: 'LineString', coordinates: polyCoords },
          },
          {
            maneuver: {
              type: 'alight',
              location: alightLoc,
            },
            name:     alightStopName,
            distance: bestLeg.alightStopDistM,
            duration: bestLeg.walkFromStopSec,
            geometry: { type: 'LineString', coordinates: [alightLoc, to] },
          },
          {
            maneuver: {
              type: 'arrive',
              location: to,
            },
            name: '',
            distance: 0,
            duration: 0,
            geometry: { type: 'LineString', coordinates: [to, to] },
          },
        ];

        modes.transit = {
          mode: 'transit',
          durationSeconds: bestLeg.totalSec,
          durationTypicalSeconds: null,
          distanceMeters: Math.round(rideDist + walkDist),
          segments: polylineToSegments(polyCoords),
          bounds: coordsBounds(allCoords),
          steps: transitSteps,
          price: transitPrice(),
          transitLegs: transitResult.legs,
        };
      }

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

      const freshMulti: MultiRoute = {
        modes,
        selectedMode: 'driving',
        destination: to,
        origin: from,
        isOffline: false,
      };

      setMulti(freshMulti);

      // ── Step 4: Persist fresh route to cache ──────────────────────────
      const toCache: CachedMultiRoute = {
        modes,
        selectedMode: 'driving',
        destination: to,
        origin: from,
      };
      await cacheSet(cacheK, toCache);
    } catch (e: any) {
      // If we already showed cached or straight-line data, don't override state
      if (!multi) {
        const offlineModes = buildStraightLineRoute(from, to);
        setMulti({ modes: offlineModes, selectedMode: 'driving', destination: to, origin: from, isOffline: true });
      }
      setError('Офлайн горим: шулуун чиглэл харагдаж байна');
    } finally {
      setLoading(false);
    }
  }, [multi]);

  const selectMode = useCallback((m: TransportMode) => {
    setMulti(prev => (prev && prev.modes[m] ? { ...prev, selectedMode: m } : prev));
  }, []);

  /**
   * Swap a driving alternative into the primary slot.  The currently-active
   * driving route is moved into `alternatives` so it can be re-selected later.
   * No-op for any mode that isn't driving or that has no alternative at the
   * given index.
   */
  const selectAlternative = useCallback((altIdx: number) => {
    setMulti(prev => {
      if (!prev) return prev;
      const cur = prev.modes.driving;
      if (!cur || !cur.alternatives || !cur.alternatives[altIdx]) return prev;

      const chosen = cur.alternatives[altIdx];

      // Move the previously-active route into the alternatives list (at the
      // same index) and pull the chosen one out.
      const previousAsAlt: AlternativeRoute = {
        durationSeconds: cur.durationSeconds,
        durationTypicalSeconds: cur.durationTypicalSeconds,
        distanceMeters: cur.distanceMeters,
        segments: cur.segments,
        bounds: cur.bounds,
        steps: cur.steps,
      };
      const newAlts = [...cur.alternatives];
      newAlts[altIdx] = previousAsAlt;

      const newDriving: ModeRoute = {
        ...cur,
        durationSeconds: chosen.durationSeconds,
        durationTypicalSeconds: chosen.durationTypicalSeconds,
        distanceMeters: chosen.distanceMeters,
        segments: chosen.segments,
        bounds: chosen.bounds,
        steps: chosen.steps,
        alternatives: newAlts,
      };

      return {
        ...prev,
        modes: { ...prev.modes, driving: newDriving },
      };
    });
  }, []);

  const clear = useCallback(() => {
    setMulti(null);
    setError(null);
  }, []);

  const route = useMemo<ModeRoute | null>(
    () => (multi ? multi.modes[multi.selectedMode] ?? null : null),
    [multi],
  );

  return { multi, route, loading, error, fetchRoute, selectMode, selectAlternative, clear };
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
