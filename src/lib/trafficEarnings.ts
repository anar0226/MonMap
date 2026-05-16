// Client-side traffic-earnings helper.
//
// Encapsulates everything that talks to the nav-trip-* edge functions:
//   - startTrip(route): converts a ModeRoute into the route-summary payload
//     expected by nav-trip-start and creates the server-side trip row.
//   - sendHeartbeat(...): single heartbeat post.
//   - endTrip(...): closes the trip.
//
// Heartbeats are kept simple — one network call per location update at ~15s
// cadence. Network failures are swallowed; the server treats missing
// heartbeats as gaps and tolerates them. A future improvement would batch
// pending heartbeats while offline (NetInfo from useNetworkStatus).

import { AppState, type AppStateStatus } from 'react-native';
import type { ModeRoute, Congestion } from '../hooks/useDirections';
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

export interface TripRouteSummary {
  coordinates: [number, number][];
  segments: { start: number; end: number; congestion: Congestion }[];
  distanceMeters: number;
  durationSeconds: number;
  durationTypicalSeconds: number | null;
}

/**
 * Flatten a `ModeRoute` (FeatureCollection of per-edge LineStrings) into the
 * server's coordinates+segments shape. Each FeatureCollection feature is a
 * single edge — we coalesce consecutive same-congestion edges into one
 * segment range so the payload stays small for long routes.
 */
export function routeToTripSummary(route: ModeRoute): TripRouteSummary | null {
  const feats = route.segments?.features ?? [];
  if (feats.length === 0) return null;

  const coordinates: [number, number][] = [];
  coordinates.push(feats[0].geometry.coordinates[0] as [number, number]);
  for (const f of feats) {
    const [, b] = f.geometry.coordinates as [number, number][];
    coordinates.push(b);
  }

  const segments: { start: number; end: number; congestion: Congestion }[] = [];
  let runStart = 0;
  let runCongestion: Congestion = feats[0].properties.congestion ?? 'unknown';
  for (let i = 1; i < feats.length; i++) {
    const c = feats[i].properties.congestion ?? 'unknown';
    if (c !== runCongestion) {
      segments.push({ start: runStart, end: i, congestion: runCongestion });
      runStart = i;
      runCongestion = c;
    }
  }
  segments.push({ start: runStart, end: feats.length, congestion: runCongestion });

  return {
    coordinates,
    segments,
    distanceMeters:        route.distanceMeters,
    durationSeconds:       route.durationSeconds,
    durationTypicalSeconds: route.durationTypicalSeconds,
  };
}

async function postJson(path: string, body: unknown) {
  const { data } = await supabase.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) throw new Error('no_session');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : Promise.reject(await res.text());
}

export interface StartTripArgs {
  origin: [number, number];
  destination: [number, number];
  mode: ModeRoute['mode'];
  summary: TripRouteSummary;
}

export async function startTrip(args: StartTripArgs): Promise<string | null> {
  try {
    const res = await postJson('nav-trip-start', {
      origin:      args.origin,
      destination: args.destination,
      mode:        args.mode,
      route:       args.summary,
    });
    return res?.tripId ?? null;
  } catch (e) {
    console.warn('startTrip failed', e);
    return null;
  }
}

export interface HeartbeatArgs {
  tripId: string;
  lat: number;
  lon: number;
  speedMps?: number | null;
  appState: 'foreground' | 'background';
  etaSeconds?: number | null;
}

export interface HeartbeatResult {
  accepted: boolean;
  rejectReason?: string;
  creditedThisHeartbeat: number;
  earnedMntTotal: number;
  dailyCapReached: boolean;
}

export async function sendHeartbeat(h: HeartbeatArgs): Promise<HeartbeatResult | null> {
  try {
    const res = await postJson('nav-trip-heartbeat', {
      tripId:     h.tripId,
      lat:        h.lat,
      lon:        h.lon,
      speedMps:   h.speedMps,
      appState:   h.appState,
      clientTs:   new Date().toISOString(),
      etaSeconds: h.etaSeconds ?? null,
    });
    return res as HeartbeatResult;
  } catch {
    return null;
  }
}

export async function endTrip(
  tripId: string,
  reason: 'user_stopped' | 'auto_arrived' = 'user_stopped',
): Promise<void> {
  try {
    await postJson('nav-trip-end', { tripId, reason });
  } catch {
    // best-effort
  }
}

export async function refreshCongestion(
  tripId: string,
  segments: { start: number; end: number; congestion: Congestion }[],
): Promise<void> {
  try {
    await postJson('nav-trip-refresh-congestion', { tripId, segments });
  } catch {
    // best-effort
  }
}

export interface RewardedAdInfo {
  adId: string;
  videoUrl: string;
  durationSeconds: number;
  verificationToken: string;
  expiresAt: string;
}

/** Fetches the current active ad from the server. Call before showing the video. */
export async function fetchRewardedAd(tripId: string): Promise<RewardedAdInfo | null> {
  try {
    const res = await postJson('fetch-rewarded-ad', { tripId });
    return res as RewardedAdInfo;
  } catch (e) {
    console.warn('fetchRewardedAd failed', e);
    return null;
  }
}

/**
 * Call after the video finishes playing. Submits the verificationToken from
 * fetchRewardedAd — the server checks the HMAC and that enough time elapsed.
 */
export async function recordBgAdView(
  tripId: string,
  verificationToken: string,
): Promise<boolean> {
  try {
    await postJson('record-bg-ad-view', { tripId, verificationToken });
    return true;
  } catch {
    return false;
  }
}

/** Subscribe to AppState; returns an unsubscribe function. */
export function subscribeAppState(
  cb: (state: 'foreground' | 'background') => void,
): () => void {
  const handler = (s: AppStateStatus) => cb(s === 'active' ? 'foreground' : 'background');
  const sub = AppState.addEventListener('change', handler);
  cb(AppState.currentState === 'active' ? 'foreground' : 'background');
  return () => sub.remove();
}

/** Simple controller that posts a heartbeat every `intervalMs`. */
export interface HeartbeatRunner {
  stop(): void;
}

export function startHeartbeatLoop(args: {
  tripId: string;
  intervalMs?: number;
  getPosition: () => { lat: number; lon: number; speedMps: number | null; etaSeconds: number | null } | null;
  getAppState: () => 'foreground' | 'background';
  onResult?: (r: HeartbeatResult) => void;
}): HeartbeatRunner {
  const interval = args.intervalMs ?? 15_000;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    const pos = args.getPosition();
    if (pos) {
      const r = await sendHeartbeat({
        tripId:     args.tripId,
        lat:        pos.lat,
        lon:        pos.lon,
        speedMps:   pos.speedMps ?? null,
        appState:   args.getAppState(),
        etaSeconds: pos.etaSeconds,
      });
      if (r && args.onResult) args.onResult(r);
    }
    if (!stopped) setTimeout(tick, interval);
  };

  setTimeout(tick, interval);

  return {
    stop() { stopped = true; },
  };
}
