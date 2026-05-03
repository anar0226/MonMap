import { useState, useRef, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';
import {
  distanceMeters,
  formatDistanceMn,
  translateManeuver,
  type NavStep,
} from '../lib/navigation';
import { speak, stopSpeech, initSpeech } from '../lib/speech';

export type NavMode = 'idle' | 'active' | 'arrived' | 'off_route';

interface NavSnapshot {
  mode: NavMode;
  stepIndex: number;
  userLocation: [number, number] | null;
  heading: number | null;
  distanceToNextManeuver: number;
  distanceToDestination: number;
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

  const announceUpcoming = useCallback((step: NavStep, distM: number, tag: string) => {
    if (announcedRef.current.has(tag)) return;
    announcedRef.current.add(tag);
    const action = translateManeuver(step.maneuver, step.name);
    const distText = formatDistanceMn(distM);
    speak(`${distText}-н дараа ${action}`);
  }, []);

  const handleLocation = useCallback((coords: { longitude: number; latitude: number; heading?: number | null }) => {
    const loc: [number, number] = [coords.longitude, coords.latitude];
    const steps = stepsRef.current;
    const dest = destRef.current;
    if (!steps || !dest || modeRef.current !== 'active') {
      setSnap(p => ({ ...p, userLocation: loc, heading: coords.heading ?? p.heading }));
      return;
    }

    const distToDest = distanceMeters(loc, dest);

    // Arrival check
    if (distToDest < ARRIVAL_THRESHOLD_M) {
      modeRef.current = 'arrived';
      speak('Хүрэх газартаа хүрлээ');
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

    // Voice cues
    if (distToNext < VOICE_NOW_M) {
      const action = translateManeuver(nextStep.maneuver, nextStep.name);
      if (!announcedRef.current.has('now')) {
        announcedRef.current.add('now');
        speak(`Одоо ${action}`);
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

  const start = useCallback(async (steps: NavStep[], destination: [number, number]) => {
    if (steps.length === 0) return;

    await initSpeech();

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
      const action = translateManeuver(first.maneuver, first.name);
      speak(`${formatDistanceMn(dist)}-н дараа ${action}`);
      announcedRef.current.add('entry');
    }

    subRef.current?.remove();
    subRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      (loc) => {
        handleLocation({
          longitude: loc.coords.longitude,
          latitude: loc.coords.latitude,
          heading: loc.coords.heading,
        });
      },
    );
  }, [handleLocation]);

  const stop = useCallback(() => {
    modeRef.current = 'idle';
    stepsRef.current = null;
    destRef.current = null;
    stepIndexRef.current = 0;
    announcedRef.current = new Set();
    subRef.current?.remove();
    subRef.current = null;
    stopSpeech();
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
    start,
    stop,
  };
}
