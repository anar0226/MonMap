import { useState, useRef, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import {
  distanceMeters,
  formatDistanceMn,
  translateManeuver,
  translateManeuverEn,
  formatDistanceEn,
  type NavStep,
} from '../lib/navigation';
import { speak, stopSpeech, initSpeech } from '../lib/speech';
import {
  startTrip,
  endTrip,
  startHeartbeatLoop,
  subscribeAppState,
  refreshCongestion,
  routeToTripSummary,
  type TripRouteSummary,
  type HeartbeatResult,
  type HeartbeatRunner,
} from '../lib/trafficEarnings';
import type { ModeRoute } from './useDirections';

export type NavMode = 'idle' | 'active' | 'arrived' | 'off_route' | 'rerouting';

interface NavSnapshot {
  mode: NavMode;
  stepIndex: number;
  userLocation: [number, number] | null;
  heading: number | null;
  distanceToNextManeuver: number;
  distanceToDestination: number;
}

export interface EarningsSnapshot {
  tripId: string | null;
  earnedMnt: number;
  isEarningNow: boolean;
  dailyCapReached: boolean;
  lastRejectReason: string | null;
}

// Returns the minimum perpendicular distance (metres) from point p to a
// LineString polyline using equirectangular approximation (accurate within ~0.1%
// for city-scale distances).
function minDistToPolylineM(p: [number, number], coords: [number, number][]): number {
  const toRad = Math.PI / 180;
  const R = 6_371_000;
  let min = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const cos = Math.cos(((a[1] + b[1]) / 2) * toRad);
    const px = p[0] * cos,  py = p[1];
    const ax = a[0] * cos,  ay = a[1];
    const bx = b[0] * cos,  by = b[1];
    const dx = bx - ax,     dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    const d = Math.sqrt(ex * ex + ey * ey) * R * toRad;
    if (d < min) min = d;
  }
  return min;
}

const ARRIVAL_THRESHOLD_M = 30;
const ADVANCE_STEP_THRESHOLD_M = 25;
const OFF_ROUTE_THRESHOLD_M = 80;
const VOICE_FAR_M = 500;
const VOICE_NEAR_M = 150;
const VOICE_NOW_M = 40;

export function useNavigation() {
  const [snap, setSnap] = useState<NavSnapshot>({
    mode: 'idle',
    stepIndex: 0,
    userLocation: null,
    heading: null,
    distanceToNextManeuver: 0,
    distanceToDestination: 0,
  });

  const stepsRef = useRef<NavStep[] | null>(null);
  const destRef = useRef<[number, number] | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
  const stepIndexRef = useRef(0);
  const modeRef = useRef<NavMode>('idle');
  const onRerouteRef = useRef<((loc: [number, number]) => void) | null>(null);

  // Traffic-earnings state. These refs feed the heartbeat loop without
  // re-triggering renders on every location update.
  const lastPosRef = useRef<{ lat: number; lon: number; speedMps: number | null; etaSeconds: number | null } | null>(null);
  const appStateRef = useRef<'foreground' | 'background'>('foreground');
  const heartbeatRef = useRef<HeartbeatRunner | null>(null);
  const tripIdRef = useRef<string | null>(null);
  const congestionRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshSummaryRef = useRef<TripRouteSummary | null>(null);
  const [earnings, setEarnings] = useState<EarningsSnapshot>({
    tripId: null,
    earnedMnt: 0,
    isEarningNow: false,
    dailyCapReached: false,
    lastRejectReason: null,
  });

  const announceUpcoming = useCallback((step: NavStep, distM: number, tag: string) => {
    if (announcedRef.current.has(tag)) return;
    announcedRef.current.add(tag);
    const action = translateManeuverEn(step.maneuver, step.name);
    const distText = formatDistanceEn(distM);
    speak(`In ${distText}, ${action}`);
  }, []);

  const handleLocation = useCallback((coords: { longitude: number; latitude: number; heading?: number | null }) => {
    const loc: [number, number] = [coords.longitude, coords.latitude];
    const steps = stepsRef.current;
    const dest = destRef.current;
    if (!steps || !dest || (modeRef.current !== 'active' && modeRef.current !== 'off_route' && modeRef.current !== 'rerouting')) {
      setSnap(p => ({ ...p, userLocation: loc, heading: coords.heading ?? p.heading }));
      return;
    }

    // In off_route / rerouting mode just track location — step progression is
    // paused until a new route is loaded (rerouting) or the user ends nav (off_route).
    if (modeRef.current === 'off_route' || modeRef.current === 'rerouting') {
      setSnap(p => ({ ...p, userLocation: loc, heading: coords.heading ?? p.heading }));
      return;
    }

    const distToDest = distanceMeters(loc, dest);

    // Arrival check
    if (distToDest < ARRIVAL_THRESHOLD_M) {
      modeRef.current = 'arrived';
      speak('You have arrived at your destination');
      setSnap({
        mode: 'arrived',
        stepIndex: steps.length - 1,
        userLocation: loc,
        heading: coords.heading ?? null,
        distanceToNextManeuver: 0,
        distanceToDestination: distToDest,
      });
      return;
    }

    const idx = stepIndexRef.current;
    const nextStep = idx + 1 < steps.length ? steps[idx + 1] : null;

    if (!nextStep) {
      setSnap(p => ({
        ...p,
        userLocation: loc,
        heading: coords.heading ?? p.heading,
        distanceToDestination: distToDest,
      }));
      return;
    }

    const distToNext = distanceMeters(loc, nextStep.maneuver.location);

    // Advance step when user passes the maneuver point
    if (distToNext < ADVANCE_STEP_THRESHOLD_M) {
      const newIdx = idx + 1;
      stepIndexRef.current = newIdx;
      announcedRef.current = new Set();

      // Announce the next-next step (the new "upcoming" maneuver)
      const newNext = newIdx + 1 < steps.length ? steps[newIdx + 1] : null;
      if (newNext) {
        const segDist = steps[newIdx].distance;
        announceUpcoming(newNext, segDist, 'entry');
      }

      const newDistToNext = newNext
        ? distanceMeters(loc, newNext.maneuver.location)
        : distToDest;

      setSnap({
        mode: 'active',
        stepIndex: newIdx,
        userLocation: loc,
        heading: coords.heading ?? null,
        distanceToNextManeuver: newDistToNext,
        distanceToDestination: distToDest,
      });
      return;
    }

    // Off-route detection: compare user position to current step's geometry.
    const curStep = steps[idx];
    if (curStep?.geometry?.coordinates && curStep.geometry.coordinates.length >= 2) {
      if (minDistToPolylineM(loc, curStep.geometry.coordinates) > OFF_ROUTE_THRESHOLD_M) {
        // If a reroute callback is registered, transition to 'rerouting' and let
        // the host fetch a fresh route. Otherwise fall back to the old behaviour
        // of stopping at 'off_route' and asking the user to restart.
        if (onRerouteRef.current) {
          modeRef.current = 'rerouting';
          speak('Recalculating route');
          setSnap(p => ({ ...p, mode: 'rerouting', userLocation: loc, heading: coords.heading ?? p.heading }));
          onRerouteRef.current(loc);
          return;
        }
        modeRef.current = 'off_route';
        speak('Off route. Please get a new route.');
        setSnap(p => ({ ...p, mode: 'off_route', userLocation: loc, heading: coords.heading ?? p.heading }));
        return;
      }
    }

    // Voice cues
    if (distToNext < VOICE_NOW_M) {
      const action = translateManeuverEn(nextStep.maneuver, nextStep.name);
      if (!announcedRef.current.has('now')) {
        announcedRef.current.add('now');
        speak(`Now, ${action}`);
      }
    } else if (distToNext < VOICE_NEAR_M) {
      announceUpcoming(nextStep, distToNext, 'near');
    } else if (distToNext < VOICE_FAR_M) {
      announceUpcoming(nextStep, distToNext, 'far');
    }

    setSnap({
      mode: 'active',
      stepIndex: idx,
      userLocation: loc,
      heading: coords.heading ?? null,
      distanceToNextManeuver: distToNext,
      distanceToDestination: distToDest,
    });
  }, [announceUpcoming]);

  const start = useCallback(async (
    steps: NavStep[],
    destination: [number, number],
    origin?: [number, number],
    route?: ModeRoute,
    options?: { onReroute?: (loc: [number, number]) => void; isReroute?: boolean },
  ) => {
    if (steps.length === 0) return;

    await initSpeech();

    if (options?.onReroute !== undefined) {
      onRerouteRef.current = options.onReroute;
    }
    const isReroute = options?.isReroute ?? false;

    stepsRef.current = steps;
    destRef.current = destination;
    stepIndexRef.current = 0;
    announcedRef.current = new Set();
    modeRef.current = 'active';

    setSnap(p => ({
      ...p,
      mode: 'active',
      stepIndex: 0,
      distanceToNextManeuver: 0,
      distanceToDestination: 0,
      // Seed userLocation so the nav puck and camera-follow effect have a
      // coordinate before the first GPS update arrives.
      userLocation: origin ?? p.userLocation,
    }));

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      modeRef.current = 'idle';
      setSnap(p => ({ ...p, mode: 'idle' }));
      return;
    }

    // Initial spoken cue: announce first upcoming maneuver
    if (steps.length >= 2) {
      const first = steps[1];
      const dist = steps[0].distance;
      const action = translateManeuverEn(first.maneuver, first.name);
      speak(`In ${formatDistanceEn(dist)}, ${action}`);
      announcedRef.current.add('entry');
    }

    // Traffic-earnings: start a server-side trip if we have route data and
    // the route is driving-mode. Skip on reroute — the existing trip stays alive.
    // Failures here are non-fatal — navigation still works without earnings.
    if (!isReroute && origin && route && route.mode === 'driving') {
      const summary = routeToTripSummary(route);
      if (summary) {
        refreshSummaryRef.current = summary;
        const tripId = await startTrip({
          origin,
          destination,
          mode: 'driving',
          summary,
        });
        if (tripId) {
          tripIdRef.current = tripId;
          setEarnings(e => ({ ...e, tripId, earnedMnt: 0, isEarningNow: false }));

          const unsubscribeAppState = subscribeAppState(s => { appStateRef.current = s; });
          const runner = startHeartbeatLoop({
            tripId,
            intervalMs: 15_000,
            getPosition: () => lastPosRef.current,
            getAppState: () => appStateRef.current,
            onResult: (r: HeartbeatResult) => {
              setEarnings(prev => ({
                tripId,
                earnedMnt: r.earnedMntTotal,
                isEarningNow: r.accepted && r.creditedThisHeartbeat > 0,
                dailyCapReached: r.dailyCapReached,
                lastRejectReason: r.rejectReason ?? null,
              }));
            },
          });
          heartbeatRef.current = {
            stop() {
              runner.stop();
              unsubscribeAppState();
            },
          };

          // Periodically refresh per-segment congestion so credit gating
          // stays accurate over long trips.
          congestionRefreshRef.current = setInterval(() => {
            const s = refreshSummaryRef.current;
            const tId = tripIdRef.current;
            if (s && tId) refreshCongestion(tId, s.segments);
          }, 2 * 60_000);
        }
      }
    }

    subRef.current?.remove();
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      (loc) => {
        // Capture for heartbeat loop (speed is m/s, may be null on some platforms).
        lastPosRef.current = {
          lat:        loc.coords.latitude,
          lon:        loc.coords.longitude,
          speedMps:   typeof loc.coords.speed === 'number' && loc.coords.speed >= 0 ? loc.coords.speed : null,
          etaSeconds: null,
        };
        handleLocation({
          longitude: loc.coords.longitude,
          latitude:  loc.coords.latitude,
          heading:   loc.coords.heading,
        });
      },
    );
  }, [handleLocation]);

  const stop = useCallback(() => {
    const finalMode = modeRef.current;
    modeRef.current = 'idle';
    stepsRef.current = null;
    destRef.current = null;
    stepIndexRef.current = 0;
    announcedRef.current = new Set();
    onRerouteRef.current = null;
    subRef.current?.remove();
    subRef.current = null;
    stopSpeech();

    // Tear down traffic-earnings.
    heartbeatRef.current?.stop();
    heartbeatRef.current = null;
    if (congestionRefreshRef.current) {
      clearInterval(congestionRefreshRef.current);
      congestionRefreshRef.current = null;
    }
    if (tripIdRef.current) {
      const tId = tripIdRef.current;
      tripIdRef.current = null;
      endTrip(tId, finalMode === 'arrived' ? 'auto_arrived' : 'user_stopped');
    }
    refreshSummaryRef.current = null;
    lastPosRef.current = null;
    setEarnings({ tripId: null, earnedMnt: 0, isEarningNow: false, dailyCapReached: false, lastRejectReason: null });

    setSnap({
      mode: 'idle',
      stepIndex: 0,
      userLocation: null,
      heading: null,
      distanceToNextManeuver: 0,
      distanceToDestination: 0,
    });
  }, []);

  useEffect(() => () => {
    subRef.current?.remove();
    heartbeatRef.current?.stop();
    if (congestionRefreshRef.current) clearInterval(congestionRefreshRef.current);
    if (tripIdRef.current) endTrip(tripIdRef.current);
    stopSpeech();
  }, []);

  const currentStep = stepsRef.current?.[snap.stepIndex] ?? null;
  const upcomingStep =
    stepsRef.current && snap.stepIndex + 1 < stepsRef.current.length
      ? stepsRef.current[snap.stepIndex + 1]
      : null;

  return {
    ...snap,
    currentStep,
    upcomingStep,
    totalSteps: stepsRef.current?.length ?? 0,
    earnings,
    start,
    stop,
  };
}
