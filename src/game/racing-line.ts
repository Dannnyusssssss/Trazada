import { clamp, mod } from '../core/math';
import { AI, RACING_LINE } from '../data/balance';
import type { CarParams } from '../data/cars';
import type { Track } from './track';

/**
 * Línea de carrera de un circuito: un desplazamiento lateral por muestra de la pista que abre las curvas
 * (por fuera al entrar, por dentro en el vértice y por fuera a la salida), dentro del asfalto.
 * Se obtiene relajando la curvatura: cada punto se acerca al punto medio de sus vecinos a cierta distancia,
 * primero a escala grande y luego a escalas menores. Es lógica pura y se calcula una vez por circuito.
 */
export class RacingLine {
  /** Desplazamiento lateral de la línea (m), positivo hacia la izquierda del sentido de carrera. */
  readonly offset: Float64Array;
  /** Curvatura sin signo de la línea (1/m). */
  readonly curvature: Float64Array;
  /** Distancia a lo largo de la línea entre la muestra i y la siguiente (m). */
  readonly segment: Float64Array;
  /** Desplazamiento lateral máximo permitido (m). */
  readonly maxOffset: number;

  constructor(readonly track: Track) {
    const n = track.sampleCount;
    this.maxOffset = Math.max(0, track.halfWidth - AI.lineMargin);
    const offset = new Float64Array(n);
    const nx = new Float64Array(n);
    const nz = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      // Normal izquierda de la pista: (tz, -tx).
      nx[i] = track.tz[i] ?? 0;
      nz[i] = -(track.tx[i] ?? 1);
    }
    const px = (i: number): number => track.x(i) + (nx[i] ?? 0) * (offset[i] ?? 0);
    const pz = (i: number): number => track.z(i) + (nz[i] ?? 0) * (offset[i] ?? 0);

    for (const [span, iterations] of RACING_LINE.passes) {
      for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < n; i++) {
          const a = mod(i - span, n);
          const b = mod(i + span, n);
          const mx = (px(a) + px(b)) / 2;
          const mz = (pz(a) + pz(b)) / 2;
          // Desplazamiento que llevaría el punto al punto medio, proyectado sobre la normal.
          const target = (mx - track.x(i)) * (nx[i] ?? 0) + (mz - track.z(i)) * (nz[i] ?? 0);
          offset[i] = clamp(target, -this.maxOffset, this.maxOffset);
        }
      }
    }
    // Suavizado final: el recorte contra el borde deja esquinas (picos de curvatura); unas pasadas de media
    // móvil las redondean sin salir del asfalto.
    const tmp = new Float64Array(n);
    const radius = RACING_LINE.smoothRadius;
    for (let pass = 0; pass < RACING_LINE.smoothPasses; pass++) {
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += offset[mod(i + k, n)] ?? 0;
        tmp[i] = clamp(sum / (2 * radius + 1), -this.maxOffset, this.maxOffset);
      }
      offset.set(tmp);
    }
    this.offset = offset;

    // Longitud de cada tramo y curvatura de la línea resultante.
    this.segment = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const j = mod(i + 1, n);
      this.segment[i] = Math.hypot(px(j) - px(i), pz(j) - pz(i));
    }
    const raw = new Float64Array(n);
    const step = 3;
    for (let i = 0; i < n; i++) {
      const a = mod(i - step, n);
      const b = mod(i + step, n);
      const ax = px(i) - px(a);
      const az = pz(i) - pz(a);
      const bx = px(b) - px(i);
      const bz = pz(b) - pz(i);
      const angle = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
      const arc = (Math.hypot(ax, az) + Math.hypot(bx, bz)) / 2;
      raw[i] = arc > 1e-6 ? Math.abs(angle) / arc : 0;
    }
    // Suavizado corto para quitar el ruido del muestreo.
    this.curvature = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -2; k <= 2; k++) sum += raw[mod(i + k, n)] ?? 0;
      this.curvature[i] = sum / 5;
    }
  }

  /** Desplazamiento lateral de la línea en un progreso dado (m). */
  offsetAt(progress: number): number {
    const t = this.track;
    const s = mod(progress, t.length) / t.spacing;
    const i0 = mod(Math.floor(s), t.sampleCount);
    const i1 = mod(i0 + 1, t.sampleCount);
    const f = s - Math.floor(s);
    return (this.offset[i0] ?? 0) * (1 - f) + (this.offset[i1] ?? 0) * f;
  }
}

const cache = new WeakMap<Track, RacingLine>();

/** Línea de carrera de un circuito (se calcula la primera vez y se reutiliza). */
export function racingLineFor(track: Track): RacingLine {
  let line = cache.get(track);
  if (!line) {
    line = new RacingLine(track);
    cache.set(track, line);
  }
  return line;
}

/**
 * Velocidad objetivo en cada muestra para un coche: la que permite la curvatura con una aceleración lateral
 * dada, limitada por la velocidad máxima del coche y por la frenada necesaria para llegar a las curvas
 * siguientes (pasada hacia atrás alrededor de la vuelta).
 * `curvature` y `segment` describen la trayectoria: curvatura en cada muestra y longitud hasta la siguiente.
 */
export function speedProfileFor(
  curvature: ArrayLike<number>,
  segment: ArrayLike<number>,
  maxSpeed: number,
  lateralAccel: number,
  brakeDecel: number,
): Float64Array {
  const n = curvature.length;
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.max(Math.abs(curvature[i] ?? 0), 1e-5);
    v[i] = clamp(Math.sqrt(lateralAccel / k), RACING_LINE.minSpeed, maxSpeed);
  }
  // Dos vueltas hacia atrás bastan para propagar la frenada a través de la meta.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = v[mod(i + 1, n)] ?? 0;
      const reachable = Math.sqrt(next * next + 2 * brakeDecel * (segment[i] ?? 0));
      if (reachable < (v[i] ?? 0)) v[i] = reachable;
    }
  }
  return v;
}

/**
 * Tiempo de vuelta estimado (s) siguiendo un perfil de velocidad: además del perfil, limita la velocidad con
 * lo que el motor puede ganar en cada tramo (pasada hacia delante con la aceleración y las resistencias del
 * coche). Es una estimación rápida, sin simular la dirección.
 */
export function estimateLapSeconds(
  profile: ArrayLike<number>,
  segment: ArrayLike<number>,
  params: CarParams,
): number {
  const n = profile.length;
  let v = profile[0] ?? 0;
  let total = 0;
  // Dos vueltas: la primera solo sirve para que la velocidad de entrada a la vuelta sea la de régimen.
  for (let pass = 0; pass < 2; pass++) {
    total = 0;
    for (let i = 0; i < n; i++) {
      const ds = segment[i] ?? 0;
      const accel =
        params.engineAccel * Math.max(0, 1 - v / params.maxSpeed) -
        params.dragCoef * v * v -
        params.rollingResistance;
      const reachable = Math.sqrt(Math.max(0, v * v + 2 * Math.max(0, accel) * ds));
      const next = Math.min(profile[mod(i + 1, n)] ?? 0, reachable);
      total += ds / Math.max(1, (v + next) / 2);
      v = next;
    }
  }
  return total;
}

/**
 * Busca la aceleración lateral con la que el perfil de un coche sobre la línea de carrera da un tiempo de
 * vuelta estimado dado (búsqueda binaria). Así cada dificultad se define por un ritmo, no por un número
 * que dependa del circuito.
 */
export function lateralAccelForLapTime(
  line: RacingLine,
  params: CarParams,
  brakeDecel: number,
  targetSeconds: number,
): number {
  let low: number = RACING_LINE.minLateralAccel;
  let high: number = RACING_LINE.maxLateralAccel;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    const seconds = estimateLapSeconds(
      speedProfile(line, params, mid, brakeDecel),
      line.segment,
      params,
    );
    // Más aceleración lateral, curvas más rápidas y vuelta más corta.
    if (seconds > targetSeconds) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Perfil de velocidad de un coche sobre la línea de carrera. */
export function speedProfile(
  line: RacingLine,
  params: CarParams,
  lateralAccel: number,
  brakeDecel: number,
): Float64Array {
  return speedProfileFor(line.curvature, line.segment, params.maxSpeed, lateralAccel, brakeDecel);
}

/** Perfil de velocidad de un coche sobre la línea central (lo usa la ayuda de frenado). */
export function centerlineProfile(
  track: Track,
  params: CarParams,
  lateralAccel: number,
  brakeDecel: number,
): Float64Array {
  const segment = new Float64Array(track.sampleCount).fill(track.spacing);
  return speedProfileFor(track.curvature, segment, params.maxSpeed, lateralAccel, brakeDecel);
}
