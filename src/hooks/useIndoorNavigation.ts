import { useCallback, useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import { DeadReckoningEngine, CompassStabilityMonitor } from '../lib/deadReckoning'
import { dijkstra, buildNavSteps, nearestNode, haversineM } from '../lib/indoorRouting'
import type { VenueGraph, IndoorNavStep, Venue } from '../types/indoor'

// ─── Types ────────────────────────────────────────────────────────────────────
type IndoorNavMode = 'idle' | 'active' | 'arrived'

interface IndoorNavSnapshot {
  mode:                    IndoorNavMode
  userLocation:            [number, number] | null
  heading:                 number | null
  distanceToNextManeuver:  number
  distanceToDestination:   number
  currentFloor:            number
  isFloorTransitionPending: boolean
}

export interface IndoorNavState extends IndoorNavSnapshot {
  currentStep:              IndoorNavStep | null
  upcomingStep:             IndoorNavStep | null
  totalSteps:               number
  venue:                    Venue | null
  // User's projected position on the SVG floor plan (0..1 normalised)
  userPositionOnFloor:      { x: number; y: number } | null
  start: (graph: VenueGraph, destinationNodeId: string) => Promise<void>
  stop:  () => void
  confirmFloorTransition: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────
const STEP_ADVANCE_M        = 5    // advance step when within 5m of next node
const ARRIVAL_M             = 4    // declare arrived when within 4m of destination
const GPS_SNAP_INTERVAL_MS  = 3000 // snap DR position to nearest node every 3s
const COMPASS_SNAP_INTERVAL_MS = 250

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useIndoorNavigation(): IndoorNavState {
  const [snap, setSnap] = useState<IndoorNavSnapshot>({
    mode: 'idle',
    userLocation: null,
    heading: null,
    distanceToNextManeuver: 0,
    distanceToDestination: 0,
    currentFloor: 1,
    isFloorTransitionPending: false,
  })
  const [steps, setSteps]       = useState<IndoorNavStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [venue, setVenue]       = useState<Venue | null>(null)
  const [userPosOnFloor, setUserPosOnFloor] = useState<{ x: number; y: number } | null>(null)

  const drRef         = useRef<DeadReckoningEngine | null>(null)
  const compassRef    = useRef<CompassStabilityMonitor>(new CompassStabilityMonitor())
  const graphRef      = useRef<VenueGraph | null>(null)
  const stepsRef      = useRef<IndoorNavStep[]>([])
  const stepIndexRef  = useRef(0)
  const locationSubRef = useRef<Location.LocationSubscription | null>(null)
  const gpsSnapTimer  = useRef<ReturnType<typeof setInterval> | null>(null)
  const modeRef       = useRef<IndoorNavMode>('idle')
  const floorRef      = useRef(1)

  // Keep refs in sync with state so callbacks don't close over stale values
  stepsRef.current = steps
  stepIndexRef.current = stepIndex

  // ── Start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async (graph: VenueGraph, destinationNodeId: string) => {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return

    graphRef.current = graph
    setVenue(graph.venue)
    modeRef.current = 'active'
    floorRef.current = graph.venue.default_floor

    // Get starting position
    let startPos = await Location.getLastKnownPositionAsync()
    if (!startPos) startPos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation })
    const startLat = startPos.coords.latitude
    const startLng = startPos.coords.longitude

    // Find nearest entrance node as routing origin
    const originNode = nearestNode(graph, startLat, startLng, floorRef.current, 30)
      ?? [...graph.nodes.values()].find(n => n.node_type === 'entrance' && n.floor_number === floorRef.current)
      ?? graph.nodes.values().next().value

    if (!originNode) return

    const path = dijkstra(graph, originNode.id, destinationNodeId)
    if (!path) return

    const navSteps = buildNavSteps(path, graph)
    setSteps(navSteps)
    setStepIndex(0)
    stepsRef.current = navSteps
    stepIndexRef.current = 0

    // Boot dead reckoning
    drRef.current = new DeadReckoningEngine({
      initialLat:   startLat,
      initialLng:   startLng,
      initialFloor: floorRef.current,
    })

    drRef.current.start((pos) => {
      const currentStep = stepsRef.current[stepIndexRef.current]
      if (!currentStep || modeRef.current !== 'active') return

      const distToNext = haversineM(pos.lat, pos.lng, currentStep.node.lat, currentStep.node.lng)

      // Compute total remaining distance
      let distToDestination = distToNext
      for (let i = stepIndexRef.current; i < stepsRef.current.length - 1; i++) {
        distToDestination += stepsRef.current[i].distance_m
      }

      // Arrival check
      const isLast = stepIndexRef.current >= stepsRef.current.length - 1
      if (isLast && distToNext <= ARRIVAL_M) {
        modeRef.current = 'arrived'
        setSnap(s => ({ ...s, mode: 'arrived' }))
        return
      }

      // Step advance
      if (distToNext <= STEP_ADVANCE_M && !isLast) {
        const nextIdx = stepIndexRef.current + 1
        const nextStep = stepsRef.current[nextIdx]
        stepIndexRef.current = nextIdx
        setStepIndex(nextIdx)

        // Flag floor transition
        const isFloorChange = nextStep?.maneuver_type?.startsWith('floor_transition')
        setSnap(s => ({ ...s, isFloorTransitionPending: isFloorChange ?? false }))
      }

      // Project onto SVG floor plan
      const floor = graphRef.current?.floors.find(f => f.floor_number === pos.floorNumber)
      const posOnFloor = floor ? projectToFloor(pos.lat, pos.lng, floor) : null
      setUserPosOnFloor(posOnFloor)

      setSnap(s => ({
        ...s,
        mode:                    'active',
        userLocation:            [pos.lat, pos.lng],
        distanceToNextManeuver:  distToNext,
        distanceToDestination:   distToDestination,
        currentFloor:            pos.floorNumber,
      }))
    })

    // Watch GPS for heading + periodic snap corrections
    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy:          Location.Accuracy.BestForNavigation,
        timeInterval:      500,
        distanceInterval:  0,
      },
      (loc) => {
        const h = loc.coords.heading
        if (h !== null && h >= 0) {
          compassRef.current.push(h)
          if (!compassRef.current.isUnstable) {
            drRef.current?.updateHeading(h)
          }
          setSnap(s => ({ ...s, heading: h }))
        }
        setSnap(s => ({ ...s, userLocation: [loc.coords.latitude, loc.coords.longitude] }))
      },
    )

    // Snap DR to nearest node every GPS_SNAP_INTERVAL_MS
    gpsSnapTimer.current = setInterval(async () => {
      if (modeRef.current !== 'active' || !graphRef.current) return
      const loc = await Location.getLastKnownPositionAsync()
      if (!loc) return
      const nearest = nearestNode(graphRef.current, loc.coords.latitude, loc.coords.longitude, floorRef.current)
      if (nearest) drRef.current?.snap(nearest.lat, nearest.lng)
    }, GPS_SNAP_INTERVAL_MS)

    setSnap(s => ({
      ...s,
      mode:         'active',
      currentFloor: floorRef.current,
      userLocation: [startLat, startLng],
    }))
  }, [])

  // ── Stop ──────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    modeRef.current = 'idle'
    drRef.current?.stop()
    drRef.current = null
    locationSubRef.current?.remove()
    locationSubRef.current = null
    if (gpsSnapTimer.current) { clearInterval(gpsSnapTimer.current); gpsSnapTimer.current = null }
    graphRef.current = null
    setVenue(null)
    setSteps([])
    setStepIndex(0)
    setUserPosOnFloor(null)
    setSnap({
      mode: 'idle', userLocation: null, heading: null,
      distanceToNextManeuver: 0, distanceToDestination: 0,
      currentFloor: 1, isFloorTransitionPending: false,
    })
  }, [])

  // ── Confirm floor transition ───────────────────────────────────────────────
  const confirmFloorTransition = useCallback(() => {
    const nextStep = stepsRef.current[stepIndexRef.current]
    if (!nextStep) return

    const transitionNode = nextStep.node
    const targetNodeId   = transitionNode.connects_to_node_id
    if (!targetNodeId || !graphRef.current) {
      setSnap(s => ({ ...s, isFloorTransitionPending: false }))
      return
    }

    const targetNode = graphRef.current.nodes.get(targetNodeId)
    if (!targetNode) return

    floorRef.current = targetNode.floor_number
    drRef.current?.setFloor(targetNode.floor_number)
    drRef.current?.snap(targetNode.lat, targetNode.lng)
    setSnap(s => ({ ...s, currentFloor: targetNode.floor_number, isFloorTransitionPending: false }))
  }, [])

  // Cleanup on unmount
  useEffect(() => () => { stop() }, [stop])

  const currentStep  = steps[stepIndex]  ?? null
  const upcomingStep = steps[stepIndex + 1] ?? null

  return {
    ...snap,
    currentStep,
    upcomingStep,
    totalSteps: steps.length,
    venue,
    userPositionOnFloor: userPosOnFloor,
    start,
    stop,
    confirmFloorTransition,
  }
}

// ─── Floor plan projection ─────────────────────────────────────────────────────
// Returns normalised (0..1) x/y coordinates on the SVG floor plan.
function projectToFloor(
  lat: number,
  lng: number,
  floor: { anchor_lat: number | null; anchor_lng: number | null; plan_width_m: number | null; plan_height_m: number | null; anchor_rotation_deg: number },
): { x: number; y: number } | null {
  if (!floor.anchor_lat || !floor.anchor_lng || !floor.plan_width_m || !floor.plan_height_m) return null

  const metersPerLat = 111_111
  const metersPerLng = 111_111 * Math.cos(floor.anchor_lat * (Math.PI / 180))

  const dLatM = (lat - floor.anchor_lat) * metersPerLat
  const dLngM = (lng - floor.anchor_lng) * metersPerLng

  // Apply rotation
  const rad = -floor.anchor_rotation_deg * (Math.PI / 180)
  const xM  =  dLngM * Math.cos(rad) - dLatM * Math.sin(rad)
  const yM  =  dLngM * Math.sin(rad) + dLatM * Math.cos(rad)

  return {
    x: Math.max(0, Math.min(1, xM / floor.plan_width_m)),
    y: Math.max(0, Math.min(1, yM / floor.plan_height_m)),
  }
}
