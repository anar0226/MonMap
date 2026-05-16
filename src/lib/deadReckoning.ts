import { Accelerometer } from 'expo-sensors'
import { haversineM } from './indoorRouting'

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DRPosition {
  lat: number
  lng: number
  accuracyM: number   // estimated error radius
  floorNumber: number
}

export interface DRConfig {
  initialLat:    number
  initialLng:    number
  initialFloor:  number
  stepLengthM?:  number   // default 0.75m; calibrated during onboarding
}

// ─── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_STEP_M = 0.75
// Vertical acceleration zero-crossing threshold for step detection
const STEP_THRESHOLD = 1.2   // m/s² above gravity
const STEP_MIN_INTERVAL_MS = 300  // ignore peaks closer than 300ms (max ~3 steps/s)

// ─── Dead reckoning engine ────────────────────────────────────────────────────
export class DeadReckoningEngine {
  private lat:         number
  private lng:         number
  private floor:       number
  private stepLengthM: number
  private heading:     number = 0    // degrees, updated externally from GPS heading
  private lastStepAt:  number = 0
  private prevAccelZ:  number = 0
  private subscription: ReturnType<typeof Accelerometer.addListener> | null = null
  private driftM:      number = 0    // cumulative estimated drift
  private onUpdate:    ((pos: DRPosition) => void) | null = null

  constructor(config: DRConfig) {
    this.lat         = config.initialLat
    this.lng         = config.initialLng
    this.floor       = config.initialFloor
    this.stepLengthM = config.stepLengthM ?? DEFAULT_STEP_M
  }

  /** Called each time expo-location emits a new heading value */
  updateHeading(degrees: number) {
    this.heading = degrees
  }

  /**
   * Snap position to a known lat/lng (GPS correction or beacon snap).
   * Resets the drift estimate.
   */
  snap(lat: number, lng: number, floor?: number) {
    this.driftM = 0
    this.lat    = lat
    this.lng    = lng
    if (floor !== undefined) this.floor = floor
    this.onUpdate?.(this.position)
  }

  setFloor(floor: number) {
    this.floor = floor
    this.onUpdate?.(this.position)
  }

  get position(): DRPosition {
    return {
      lat:         this.lat,
      lng:         this.lng,
      accuracyM:   this.driftM,
      floorNumber: this.floor,
    }
  }

  start(onUpdate: (pos: DRPosition) => void) {
    this.onUpdate = onUpdate
    Accelerometer.setUpdateInterval(50)   // 20 Hz
    this.subscription = Accelerometer.addListener(({ x, y, z }) => {
      // z-axis vertical acceleration; subtract gravity (≈9.81) to get linear
      const linearZ = z - 9.81
      const now = Date.now()

      // Zero-crossing step detection: detect peak above threshold
      if (
        this.prevAccelZ < STEP_THRESHOLD &&
        linearZ >= STEP_THRESHOLD &&
        now - this.lastStepAt > STEP_MIN_INTERVAL_MS
      ) {
        this.lastStepAt = now
        this.advanceStep()
      }
      this.prevAccelZ = linearZ
    })
  }

  stop() {
    this.subscription?.remove()
    this.subscription = null
    this.onUpdate = null
  }

  private advanceStep() {
    const rad = this.heading * (Math.PI / 180)
    const metersPerLat = 111_111
    const metersPerLng = 111_111 * Math.cos(this.lat * (Math.PI / 180))

    this.lat += (this.stepLengthM * Math.cos(rad)) / metersPerLat
    this.lng += (this.stepLengthM * Math.sin(rad)) / metersPerLng
    // Drift accumulates at ~10% of distance walked (compass + step error)
    this.driftM += this.stepLengthM * 0.1

    this.onUpdate?.(this.position)
  }
}

// ─── Compass stability check ──────────────────────────────────────────────────
/**
 * Tracks recent heading values to detect magnetic interference (e.g. near elevators).
 * Returns true when variance > threshold — caller should disable compass and
 * rely on step direction only.
 */
export class CompassStabilityMonitor {
  private samples: number[] = []
  private readonly windowSize: number
  private readonly varianceThreshold: number

  constructor(windowSize = 10, varianceThreshold = 30) {
    this.windowSize        = windowSize
    this.varianceThreshold = varianceThreshold
  }

  push(heading: number) {
    this.samples.push(heading)
    if (this.samples.length > this.windowSize) this.samples.shift()
  }

  get isUnstable(): boolean {
    if (this.samples.length < 4) return false
    const mean = this.samples.reduce((s, v) => s + v, 0) / this.samples.length
    const variance = this.samples.reduce((s, v) => s + (v - mean) ** 2, 0) / this.samples.length
    return Math.sqrt(variance) > this.varianceThreshold
  }
}

// ─── Step calibration helper ──────────────────────────────────────────────────
/**
 * Measures step length during a calibration walk.
 * Usage:
 *   const cal = new StepCalibrator()
 *   cal.start()
 *   // user walks a known distance
 *   const stepM = cal.finish(knownDistanceM)
 */
export class StepCalibrator {
  private stepCount = 0
  private prevAccelZ = 0
  private lastStepAt = 0
  private subscription: ReturnType<typeof Accelerometer.addListener> | null = null

  start() {
    this.stepCount = 0
    Accelerometer.setUpdateInterval(50)
    this.subscription = Accelerometer.addListener(({ z }) => {
      const linear = z - 9.81
      const now = Date.now()
      if (
        this.prevAccelZ < STEP_THRESHOLD &&
        linear >= STEP_THRESHOLD &&
        now - this.lastStepAt > STEP_MIN_INTERVAL_MS
      ) {
        this.stepCount++
        this.lastStepAt = now
      }
      this.prevAccelZ = linear
    })
  }

  finish(knownDistanceM: number): number {
    this.subscription?.remove()
    this.subscription = null
    if (this.stepCount === 0) return DEFAULT_STEP_M
    return knownDistanceM / this.stepCount
  }
}
