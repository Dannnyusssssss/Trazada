import { lerp, lerpAngle, wrapAngle } from '../core/math';
import { GHOST, SIM } from '../data/balance';
import type { CarState } from './car';
import { createTrackQuery, progressDelta, type Track } from './track';

/** Pasos de simulación entre dos muestras del fantasma (60 Hz / 20 Hz = 3). */
export const GHOST_STEP = Math.round(SIM.hz / GHOST.hz);
/** Número máximo de muestras de una vuelta grabada. */
export const GHOST_MAX_SAMPLES = GHOST.hz * GHOST.maxSeconds + 1;

/**
 * Vuelta grabada. `samples` tiene 3 enteros por muestra: x y z en centímetros y el rumbo en
 * diezmilésimas de radián. La muestra k corresponde al paso 3·k de la vuelta.
 */
export interface GhostData {
  trackId: string;
  carId: string;
  lapMs: number;
  samples: Int32Array;
}

export function sampleCount(data: GhostData): number {
  return Math.floor(data.samples.length / 3);
}

/** Muestras esperadas para una vuelta de `lapMs` milisegundos. */
export function expectedSamples(lapMs: number): number {
  const steps = Math.round((lapMs * SIM.hz) / 1000);
  return Math.floor(steps / GHOST_STEP) + 1;
}

/** Graba la vuelta en curso en un búfer reservado de antemano (sin crear objetos por paso). */
export class GhostRecorder {
  private readonly buffer = new Int32Array(GHOST_MAX_SAMPLES * 3);
  private count = 0;
  private overflow = false;
  active = false;

  start(car: CarState): void {
    this.count = 0;
    this.overflow = false;
    this.active = true;
    this.record(car);
  }

  record(car: CarState): void {
    if (!this.active) return;
    if (this.count >= GHOST_MAX_SAMPLES) {
      // Vuelta demasiado larga: no se guardará como fantasma.
      this.overflow = true;
      return;
    }
    const o = this.count * 3;
    this.buffer[o] = Math.round(car.x * GHOST.positionScale);
    this.buffer[o + 1] = Math.round(car.z * GHOST.positionScale);
    this.buffer[o + 2] = Math.round(wrapAngle(car.heading) * GHOST.headingScale);
    this.count++;
  }

  stop(): void {
    this.active = false;
  }

  /** Cierra la vuelta y devuelve una copia de la grabación, o null si no se pudo grabar entera. */
  finish(trackId: string, carId: string, lapMs: number): GhostData | null {
    const ok = this.active && !this.overflow && this.count >= 2;
    this.active = false;
    if (!ok) return null;
    return { trackId, carId, lapMs, samples: this.buffer.slice(0, this.count * 3) };
  }
}

/**
 * Comprueba que un fantasma es coherente con un circuito: número de muestras acorde a su tiempo y todas
 * las posiciones dentro de la zona circulable (con un margen).
 */
export function validateGhost(data: GhostData, track: Track): boolean {
  if (data.trackId !== track.def.id) return false;
  if (data.samples.length % 3 !== 0) return false;
  const n = sampleCount(data);
  if (n < 2 || n > GHOST_MAX_SAMPLES) return false;
  if (Math.abs(n - expectedSamples(data.lapMs)) > 2) return false;
  const query = createTrackQuery();
  const limit = track.wallDistance + GHOST.trackTolerance;
  for (let k = 0; k < n; k++) {
    const x = (data.samples[k * 3] ?? 0) / GHOST.positionScale;
    const z = (data.samples[k * 3 + 1] ?? 0) / GHOST.positionScale;
    const heading = (data.samples[k * 3 + 2] ?? 0) / GHOST.headingScale;
    if (Math.abs(heading) > Math.PI + 0.01) return false;
    track.query(x, z, query);
    const i = query.index;
    if (Math.hypot(x - track.x(i), z - track.z(i)) > limit) return false;
  }
  return true;
}

export interface GhostPose {
  x: number;
  z: number;
  heading: number;
}

/** Reproduce un fantasma: posición interpolada por paso de vuelta y tiempo del fantasma por distancia. */
export class GhostPlayer {
  readonly carId: string;
  readonly lapMs: number;
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;
  private readonly hs: Float64Array;
  /** Distancia recorrida desde la meta en cada muestra, sin retrocesos (m). */
  private readonly distance: Float64Array;
  private readonly count: number;

  constructor(data: GhostData, track: Track) {
    this.carId = data.carId;
    this.lapMs = data.lapMs;
    this.count = sampleCount(data);
    this.xs = new Float64Array(this.count);
    this.zs = new Float64Array(this.count);
    this.hs = new Float64Array(this.count);
    this.distance = new Float64Array(this.count);
    const query = createTrackQuery();
    let previousProgress = 0;
    let travelled = 0;
    for (let k = 0; k < this.count; k++) {
      const x = (data.samples[k * 3] ?? 0) / GHOST.positionScale;
      const z = (data.samples[k * 3 + 1] ?? 0) / GHOST.positionScale;
      this.xs[k] = x;
      this.zs[k] = z;
      this.hs[k] = (data.samples[k * 3 + 2] ?? 0) / GHOST.headingScale;
      track.query(x, z, query);
      // Distancia desde la meta, acumulando lo avanzado entre muestras.
      travelled =
        k === 0
          ? progressDelta(0, query.progress, track.length)
          : travelled + progressDelta(previousProgress, query.progress, track.length);
      previousProgress = query.progress;
      this.distance[k] = k === 0 ? travelled : Math.max(this.distance[k - 1] ?? 0, travelled);
    }
  }

  /** Posición del fantasma en el paso `lapSteps` de la vuelta. Devuelve false si su vuelta ya terminó. */
  poseAt(lapSteps: number, out: GhostPose): boolean {
    const t = lapSteps / GHOST_STEP;
    if (t < 0 || t > this.count - 1) return false;
    const k = Math.min(Math.floor(t), this.count - 2);
    const f = t - k;
    out.x = lerp(this.xs[k] ?? 0, this.xs[k + 1] ?? 0, f);
    out.z = lerp(this.zs[k] ?? 0, this.zs[k + 1] ?? 0, f);
    out.heading = lerpAngle(this.hs[k] ?? 0, this.hs[k + 1] ?? 0, f);
    return true;
  }

  /** Tiempo (ms) que tardó el fantasma en recorrer `meters` desde la meta, o null fuera de rango. */
  timeAtDistance(meters: number): number | null {
    const d = this.distance;
    const last = this.count - 1;
    if (meters < (d[0] ?? 0) || meters > (d[last] ?? 0)) return null;
    // Búsqueda binaria de la última muestra con distancia <= meters.
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((d[mid] ?? 0) <= meters) lo = mid;
      else hi = mid;
    }
    const d0 = d[lo] ?? 0;
    const d1 = d[hi] ?? d0;
    const f = d1 > d0 ? (meters - d0) / (d1 - d0) : 0;
    return ((lo + f) * GHOST_STEP * 1000) / SIM.hz;
  }
}
