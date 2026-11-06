import { ClosedCatmullRom, clamp, mod, vec2, type Vec2 } from '../core/math';
import { TRACK, type Surface } from '../data/balance';
import type { TrackDef } from '../data/tracks';

/** Resultado de consultar la pista en un punto. Se reutiliza para no crear objetos por paso. */
export interface TrackQuery {
  /** Muestra de la línea central más cercana. */
  index: number;
  /** Distancia recorrida a lo largo de la vuelta, en [0, length). */
  progress: number;
  /** Distancia lateral a la línea central (m); positiva hacia la izquierda del sentido de carrera. */
  lateral: number;
  surface: Surface;
  /** Dirección unitaria de la pista en ese punto (sentido de carrera). */
  tangentX: number;
  tangentZ: number;
  /** Altura de la superficie en ese punto (m). Solo la usa el render: la física es 2D. */
  height: number;
  /** Pendiente longitudinal (m de subida por m de avance). */
  grade: number;
  /** Pendiente lateral por el peralte (m de subida por m hacia la izquierda). */
  bank: number;
}

export function createTrackQuery(): TrackQuery {
  return {
    index: 0,
    progress: 0,
    lateral: 0,
    surface: 'asphalt',
    tangentX: 1,
    tangentZ: 0,
    height: 0,
    grade: 0,
    bank: 0,
  };
}

/** Spline Catmull-Rom uniforme de un valor (la altura) sobre los mismos segmentos que el trazado. */
function catmullRom1D(v0: number, v1: number, v2: number, v3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * v1 +
      (-v0 + v2) * t +
      (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
      (-v0 + 3 * v1 - 3 * v2 + v3) * t3)
  );
}

/** Media móvil circular de radio `radius` muestras. */
function smoothCircular(values: Float64Array, radius: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += values[mod(i + k, n)] ?? 0;
    out[i] = sum / (2 * radius + 1);
  }
  return out;
}

/**
 * Pista lista para la simulación: línea central muestreada a intervalos regulares, con tangentes,
 * curvatura, altura, peralte, tramos con piano y una rejilla espacial para encontrar rápido el punto más cercano.
 */
export class Track {
  readonly def: TrackDef;
  readonly length: number;
  readonly sampleCount: number;
  /** Distancia real entre muestras (m), muy cercana a TRACK.sampleSpacing. */
  readonly spacing: number;
  readonly halfWidth: number;
  /** Distancia lateral máxima: a partir de aquí está el muro. */
  readonly wallDistance: number;
  readonly px: Float64Array;
  readonly pz: Float64Array;
  /** Altura de la línea central (m). */
  readonly py: Float64Array;
  readonly tx: Float64Array;
  readonly tz: Float64Array;
  /** Curvatura con signo (1/m); positiva en curvas a la izquierda. */
  readonly curvature: Float64Array;
  /** Pendiente longitudinal en cada muestra. */
  readonly grade: Float64Array;
  /** Pendiente lateral del peralte en cada muestra (positiva: el lado izquierdo está más alto). */
  readonly bank: Float64Array;
  /** 1 si el borde de la pista lleva piano en esa muestra. */
  readonly curbed: Uint8Array;
  /** Progreso de cada checkpoint (el 0 es la meta). */
  readonly checkpointProgress: Float64Array;
  /** Altura mínima de la línea central (referencia del terreno lejano, que queda siempre por debajo). */
  readonly minHeight: number;

  private readonly gridMinX: number;
  private readonly gridMinZ: number;
  private readonly gridCols: number;
  private readonly gridRows: number;
  private readonly gridStart: Int32Array;
  private readonly gridItems: Int32Array;

  constructor(def: TrackDef) {
    this.def = def;
    this.halfWidth = def.width / 2;
    this.wallDistance = this.halfWidth + def.runoff;

    // 1. Longitud del arco con una polilínea densa sobre la spline (la altura usa los mismos parámetros).
    const spline = new ClosedCatmullRom(def.points.map(([x, z]) => [x, z] as const));
    const heights = def.points.map((point) => point[2]);
    const m = heights.length;
    const sub = TRACK.splineSubdivisions;
    const denseCount = spline.segmentCount * sub;
    const dx = new Float64Array(denseCount + 1);
    const dz = new Float64Array(denseCount + 1);
    const dy = new Float64Array(denseCount + 1);
    const ds = new Float64Array(denseCount + 1);
    const p = vec2();
    for (let i = 0; i <= denseCount; i++) {
      const segment = Math.floor(i / sub);
      const t = (i % sub) / sub;
      spline.evaluate(segment, t, p);
      dx[i] = p.x;
      dz[i] = p.z;
      dy[i] = catmullRom1D(
        heights[mod(segment - 1, m)] ?? 0,
        heights[mod(segment, m)] ?? 0,
        heights[mod(segment + 1, m)] ?? 0,
        heights[mod(segment + 2, m)] ?? 0,
        t,
      );
      if (i > 0) {
        ds[i] = (ds[i - 1] ?? 0) + Math.hypot(p.x - (dx[i - 1] ?? 0), p.z - (dz[i - 1] ?? 0));
      }
    }
    this.length = ds[denseCount] ?? 0;

    // 2. Remuestreo a intervalos iguales a lo largo del arco.
    this.sampleCount = Math.max(16, Math.round(this.length / TRACK.sampleSpacing));
    this.spacing = this.length / this.sampleCount;
    const n = this.sampleCount;
    this.px = new Float64Array(n);
    this.pz = new Float64Array(n);
    const rawHeight = new Float64Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * this.spacing;
      while (j < denseCount - 1 && (ds[j + 1] ?? 0) < s) j++;
      const s0 = ds[j] ?? 0;
      const s1 = ds[j + 1] ?? s0;
      const t = s1 > s0 ? (s - s0) / (s1 - s0) : 0;
      this.px[i] = (dx[j] ?? 0) + ((dx[j + 1] ?? 0) - (dx[j] ?? 0)) * t;
      this.pz[i] = (dz[j] ?? 0) + ((dz[j + 1] ?? 0) - (dz[j] ?? 0)) * t;
      rawHeight[i] = (dy[j] ?? 0) + ((dy[j + 1] ?? 0) - (dy[j] ?? 0)) * t;
    }
    // La altura se suaviza para que no haya cambios bruscos de pendiente.
    this.py = smoothCircular(rawHeight, TRACK.heightSmoothing);

    // 3. Tangentes (diferencia central), curvatura con signo y pendiente.
    this.tx = new Float64Array(n);
    this.tz = new Float64Array(n);
    this.grade = new Float64Array(n);
    const rawCurvature = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const prev = mod(i - 1, n);
      const next = mod(i + 1, n);
      const ax = this.x(i) - this.x(prev);
      const az = this.z(i) - this.z(prev);
      const bx = this.x(next) - this.x(i);
      const bz = this.z(next) - this.z(i);
      const cx = this.x(next) - this.x(prev);
      const cz = this.z(next) - this.z(prev);
      const len = Math.hypot(cx, cz) || 1;
      this.tx[i] = cx / len;
      this.tz[i] = cz / len;
      // Con la normal izquierda (z, -x), un giro a la izquierda da producto cruz negativo.
      const angle = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
      rawCurvature[i] = -angle / this.spacing;
      this.grade[i] = ((this.py[next] ?? 0) - (this.py[prev] ?? 0)) / (2 * this.spacing);
    }
    // Suavizado leve de la curvatura para que el remuestreo no meta ruido.
    this.curvature = smoothCircular(rawCurvature, 2);

    // 4. Peralte: el exterior de la curva queda más alto, proporcional a la curvatura y con tope.
    const rawBank = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      rawBank[i] = clamp(
        -(this.curvature[i] ?? 0) * TRACK.bankPerCurvature * def.banking,
        -TRACK.maxBank,
        TRACK.maxBank,
      );
    }
    this.bank = smoothCircular(rawBank, TRACK.bankSmoothing);

    let minHeight = Infinity;
    for (let i = 0; i < n; i++) minHeight = Math.min(minHeight, this.py[i] ?? 0);
    this.minHeight = minHeight;

    // 5. Pianos: en las curvas cerradas, ampliados unas muestras antes y después.
    this.curbed = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.curvature[i] ?? 0) < TRACK.curbCurvature) continue;
      for (let k = -TRACK.curbPadding; k <= TRACK.curbPadding; k++) this.curbed[mod(i + k, n)] = 1;
    }

    // 6. Checkpoints a intervalos iguales; el 0 es la meta.
    this.checkpointProgress = new Float64Array(def.checkpointCount);
    for (let k = 0; k < def.checkpointCount; k++) {
      this.checkpointProgress[k] = (k * this.length) / def.checkpointCount;
    }

    // 7. Rejilla espacial: cada celda guarda las muestras que pueden ser la más cercana a un punto de la
    //    celda situado dentro de la zona circulable (hasta el muro, con margen).
    const radius = this.wallDistance + 4;
    const cell = TRACK.gridCellSize;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, this.x(i));
      maxX = Math.max(maxX, this.x(i));
      minZ = Math.min(minZ, this.z(i));
      maxZ = Math.max(maxZ, this.z(i));
    }
    this.gridMinX = minX - radius;
    this.gridMinZ = minZ - radius;
    this.gridCols = Math.ceil((maxX - minX + 2 * radius) / cell) + 1;
    this.gridRows = Math.ceil((maxZ - minZ + 2 * radius) / cell) + 1;
    const cellCount = this.gridCols * this.gridRows;
    const counts = new Int32Array(cellCount + 1);
    const forEachCell = (i: number, fn: (c: number) => void): void => {
      const c0 = Math.floor((this.x(i) - radius - this.gridMinX) / cell);
      const c1 = Math.floor((this.x(i) + radius - this.gridMinX) / cell);
      const r0 = Math.floor((this.z(i) - radius - this.gridMinZ) / cell);
      const r1 = Math.floor((this.z(i) + radius - this.gridMinZ) / cell);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * this.gridCols + c);
    };
    for (let i = 0; i < n; i++) forEachCell(i, (c) => (counts[c + 1] = (counts[c + 1] ?? 0) + 1));
    for (let c = 0; c < cellCount; c++) counts[c + 1] = (counts[c + 1] ?? 0) + (counts[c] ?? 0);
    this.gridStart = counts;
    this.gridItems = new Int32Array(counts[cellCount] ?? 0);
    const fill = counts.slice(0, cellCount);
    for (let i = 0; i < n; i++) {
      forEachCell(i, (c) => {
        const at = fill[c] ?? 0;
        this.gridItems[at] = i;
        fill[c] = at + 1;
      });
    }
  }

  x(i: number): number {
    return this.px[i] ?? 0;
  }

  z(i: number): number {
    return this.pz[i] ?? 0;
  }

  /** Altura de la superficie en la muestra `i` a una distancia lateral dada (incluye el peralte). */
  heightAt(i: number, lateral: number): number {
    return (this.py[i] ?? 0) + (this.bank[i] ?? 0) * lateral;
  }

  /** Índice de la muestra más cercana a (x, z). Usa la rejilla y, fuera de ella, búsqueda completa. */
  nearestIndex(x: number, z: number): number {
    const c = Math.floor((x - this.gridMinX) / TRACK.gridCellSize);
    const r = Math.floor((z - this.gridMinZ) / TRACK.gridCellSize);
    let from = 0;
    let to = 0;
    if (c >= 0 && r >= 0 && c < this.gridCols && r < this.gridRows) {
      const cellIndex = r * this.gridCols + c;
      from = this.gridStart[cellIndex] ?? 0;
      to = this.gridStart[cellIndex + 1] ?? 0;
    }
    let best = -1;
    let bestD = Infinity;
    for (let k = from; k < to; k++) {
      const i = this.gridItems[k] ?? 0;
      const d = (this.x(i) - x) ** 2 + (this.z(i) - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    // Si el punto está fuera de la zona cubierta por la rejilla, búsqueda completa.
    const covered = this.wallDistance + 4;
    if (best < 0 || bestD > covered * covered) best = this.nearestIndexBruteForce(x, z);
    return best;
  }

  nearestIndexBruteForce(x: number, z: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.sampleCount; i++) {
      const d = (this.x(i) - x) ** 2 + (this.z(i) - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Consulta la pista en (x, z): progreso, distancia lateral, superficie, dirección y altura. */
  query(x: number, z: number, out: TrackQuery): TrackQuery {
    const i = this.nearestIndex(x, z);
    const tx = this.tx[i] ?? 1;
    const tz = this.tz[i] ?? 0;
    const ox = x - this.x(i);
    const oz = z - this.z(i);
    const along = ox * tx + oz * tz;
    out.index = i;
    out.progress = mod(i * this.spacing + along, this.length);
    out.lateral = ox * tz - oz * tx;
    out.surface = this.surfaceAt(i, out.lateral);
    out.tangentX = tx;
    out.tangentZ = tz;
    out.grade = this.grade[i] ?? 0;
    out.bank = this.bank[i] ?? 0;
    // La pendiente corrige la altura entre muestras para que no haya escalones.
    out.height =
      this.heightAt(i, clamp(out.lateral, -this.wallDistance, this.wallDistance)) +
      out.grade * along;
    return out;
  }

  surfaceAt(index: number, lateral: number): Surface {
    const a = Math.abs(lateral);
    if (a <= this.halfWidth - TRACK.curbWidth) return 'asphalt';
    if (a <= this.halfWidth) return this.curbed[index] === 1 ? 'curb' : 'asphalt';
    return 'grass';
  }

  /** Índice de la muestra correspondiente a un progreso (m) cualquiera. */
  indexAt(progress: number): number {
    return mod(Math.round(mod(progress, this.length) / this.spacing), this.sampleCount);
  }

  /** Posición sobre la línea central y dirección de la pista para un progreso dado. */
  pointAt(progress: number, outPos: Vec2, outTangent: Vec2): void {
    const s = mod(progress, this.length) / this.spacing;
    const i0 = mod(Math.floor(s), this.sampleCount);
    const i1 = mod(i0 + 1, this.sampleCount);
    const t = s - Math.floor(s);
    outPos.x = this.x(i0) + (this.x(i1) - this.x(i0)) * t;
    outPos.z = this.z(i0) + (this.z(i1) - this.z(i0)) * t;
    outTangent.x = this.tx[i0] ?? 1;
    outTangent.z = this.tz[i0] ?? 0;
  }
}

/** Distancia con signo de `from` a `to` a lo largo de una vuelta de longitud `length`, en (-L/2, L/2]. */
export function progressDelta(from: number, to: number, length: number): number {
  let d = mod(to - from, length);
  if (d > length / 2) d -= length;
  return d;
}

/**
 * Comprueba que un circuito es válido. Devuelve la lista de problemas (vacía si es correcto):
 * datos finitos, ancho mínimo, radio de curva mínimo, pendiente máxima, checkpoints coherentes y que la pista
 * no se cruce ni se acerque a sí misma (si no, el punto más cercano podría saltar de tramo).
 */
export function validateTrack(track: Track): string[] {
  const def = track.def;
  const errors: string[] = [];
  if (!/^[a-z0-9-]{1,32}$/.test(def.id)) errors.push('id inválido');
  if (def.name.trim().length === 0) errors.push('nombre vacío');
  if (def.points.length < 4) errors.push('menos de 4 puntos');
  if (def.points.some((point) => point.some((v) => !Number.isFinite(v)))) {
    errors.push('punto no finito');
  }
  if (!(def.width >= TRACK.minWidth)) errors.push('ancho menor que el mínimo');
  if (!(def.runoff >= TRACK.minRunoff)) errors.push('franja de césped menor que la mínima');
  if (!(def.banking >= 0 && def.banking <= 1)) errors.push('peralte fuera de rango');
  if (!Number.isInteger(def.checkpointCount) || def.checkpointCount < 3)
    errors.push('pocos checkpoints');
  if (def.checkpointCount * 40 > track.length) errors.push('checkpoints demasiado juntos');
  const { bronze, silver, gold } = def.medals;
  if (!(gold > 0 && gold < silver && silver < bronze))
    errors.push('tiempos de medalla incoherentes');

  let maxCurvature = 0;
  let maxGrade = 0;
  for (let i = 0; i < track.sampleCount; i++) {
    maxCurvature = Math.max(maxCurvature, Math.abs(track.curvature[i] ?? 0));
    maxGrade = Math.max(maxGrade, Math.abs(track.grade[i] ?? 0));
  }
  if (maxCurvature > 1 / TRACK.minCurveRadius) {
    errors.push(`curva demasiado cerrada (radio ${(1 / maxCurvature).toFixed(1)} m)`);
  }
  if (maxGrade > TRACK.maxGrade) {
    errors.push(`pendiente excesiva (${(maxGrade * 100).toFixed(1)} %)`);
  }

  // Dos puntos alejados a lo largo de la vuelta deben estar separados por al menos dos zonas circulables.
  const minSeparation = 2 * track.wallDistance + 2;
  const arcThreshold = Math.ceil((4 * track.wallDistance) / track.spacing);
  const n = track.sampleCount;
  let found = false;
  for (let i = 0; i < n && !found; i++) {
    for (let k = i + arcThreshold; k < n; k++) {
      if (n - (k - i) < arcThreshold) break;
      const d = Math.hypot(track.x(i) - track.x(k), track.z(i) - track.z(k));
      if (d < minSeparation) {
        found = true;
        errors.push(
          `la pista se acerca a sí misma cerca de las muestras ${i} y ${k} (${d.toFixed(1)} m)`,
        );
        break;
      }
    }
  }
  return errors;
}
