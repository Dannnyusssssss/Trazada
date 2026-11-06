/**
 * Matemáticas 2D del plano del suelo.
 *
 * Convenciones (en todo el juego):
 * - El suelo es el plano (x, z) del mundo 3D, en metros. La altura y la pone el render.
 * - Un rumbo `h` (radianes) apunta en la dirección (cos h, -sin h). Al aumentar `h` se gira a la izquierda
 *   vista desde el conductor, igual que `rotation.y` de Three.js.
 * - La normal izquierda de una dirección unitaria (x, z) es (z, -x).
 *
 * Las funciones escriben en un vector de salida para no crear objetos en el bucle caliente.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export function vec2(x = 0, z = 0): Vec2 {
  return { x, z };
}

export function set(out: Vec2, x: number, z: number): Vec2 {
  out.x = x;
  out.z = z;
  return out;
}

export function copy(out: Vec2, a: Vec2): Vec2 {
  out.x = a.x;
  out.z = a.z;
  return out;
}

export function add(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x + b.x;
  out.z = a.z + b.z;
  return out;
}

export function sub(out: Vec2, a: Vec2, b: Vec2): Vec2 {
  out.x = a.x - b.x;
  out.z = a.z - b.z;
  return out;
}

export function scale(out: Vec2, a: Vec2, s: number): Vec2 {
  out.x = a.x * s;
  out.z = a.z * s;
  return out;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.z * b.z;
}

/** Producto cruz 2D (componente perpendicular al plano). */
export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.z - a.z * b.x;
}

export function length(a: Vec2): number {
  return Math.hypot(a.x, a.z);
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function normalize(out: Vec2, a: Vec2): Vec2 {
  const len = Math.hypot(a.x, a.z);
  if (len < 1e-12) {
    out.x = 0;
    out.z = 0;
    return out;
  }
  out.x = a.x / len;
  out.z = a.z / len;
  return out;
}

/** Dirección unitaria hacia la que apunta el rumbo `h`. */
export function forwardFromHeading(out: Vec2, h: number): Vec2 {
  out.x = Math.cos(h);
  out.z = -Math.sin(h);
  return out;
}

/** Normal izquierda unitaria del rumbo `h`. */
export function leftFromHeading(out: Vec2, h: number): Vec2 {
  out.x = -Math.sin(h);
  out.z = -Math.cos(h);
  return out;
}

/** Rumbo de una dirección (no hace falta que sea unitaria). */
export function headingOf(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Lleva un ángulo al intervalo (-PI, PI]. */
export function wrapAngle(a: number): number {
  const twoPi = Math.PI * 2;
  let r = a % twoPi;
  if (r <= -Math.PI) r += twoPi;
  else if (r > Math.PI) r -= twoPi;
  return r;
}

/** Interpola ángulos por el camino más corto. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Acerca `v` a `target` como mucho `maxDelta`, sin pasarse. */
export function moveToward(v: number, target: number, maxDelta: number): number {
  if (Math.abs(target - v) <= maxDelta) return target;
  return v + Math.sign(target - v) * maxDelta;
}

/**
 * Factor de suavizado exponencial independiente de la frecuencia de frames:
 * `valor += (objetivo - valor) * dampFactor(rate, dt)` converge igual a 30 o a 144 FPS.
 */
export function dampFactor(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

/** Módulo siempre positivo. */
export function mod(a: number, n: number): number {
  const r = a % n;
  return r < 0 ? r + n : r;
}

/**
 * Spline Catmull-Rom cerrada y centrípeta (alpha = 0.5) sobre puntos de control 2D.
 * La variante centrípeta evita bucles y picos entre puntos de control desiguales.
 */
export class ClosedCatmullRom {
  private readonly xs: Float64Array;
  private readonly zs: Float64Array;

  constructor(points: readonly (readonly [number, number])[]) {
    if (points.length < 4) throw new Error('Una spline cerrada necesita al menos 4 puntos');
    this.xs = new Float64Array(points.length);
    this.zs = new Float64Array(points.length);
    points.forEach(([x, z], i) => {
      this.xs[i] = x;
      this.zs[i] = z;
    });
  }

  get segmentCount(): number {
    return this.xs.length;
  }

  /** Posición en el segmento `segment` (entre el punto `segment` y el siguiente), con t en [0, 1]. */
  evaluate(segment: number, t: number, out: Vec2): Vec2 {
    const n = this.xs.length;
    const i1 = mod(segment, n);
    const i0 = mod(i1 - 1, n);
    const i2 = mod(i1 + 1, n);
    const i3 = mod(i1 + 2, n);
    const x0 = this.xs[i0] ?? 0;
    const z0 = this.zs[i0] ?? 0;
    const x1 = this.xs[i1] ?? 0;
    const z1 = this.zs[i1] ?? 0;
    const x2 = this.xs[i2] ?? 0;
    const z2 = this.zs[i2] ?? 0;
    const x3 = this.xs[i3] ?? 0;
    const z3 = this.zs[i3] ?? 0;

    // Nudos centrípetos: la distancia entre puntos elevada a 0.5.
    const knot = (ax: number, az: number, bx: number, bz: number): number =>
      Math.max(Math.sqrt(Math.hypot(bx - ax, bz - az)), 1e-6);
    const t0 = 0;
    const t1 = t0 + knot(x0, z0, x1, z1);
    const t2 = t1 + knot(x1, z1, x2, z2);
    const t3 = t2 + knot(x2, z2, x3, z3);
    const u = t1 + (t2 - t1) * t;

    // Formulación piramidal de Barry y Goldman.
    const a1x = ((t1 - u) * x0 + (u - t0) * x1) / (t1 - t0);
    const a1z = ((t1 - u) * z0 + (u - t0) * z1) / (t1 - t0);
    const a2x = ((t2 - u) * x1 + (u - t1) * x2) / (t2 - t1);
    const a2z = ((t2 - u) * z1 + (u - t1) * z2) / (t2 - t1);
    const a3x = ((t3 - u) * x2 + (u - t2) * x3) / (t3 - t2);
    const a3z = ((t3 - u) * z2 + (u - t2) * z3) / (t3 - t2);
    const b1x = ((t2 - u) * a1x + (u - t0) * a2x) / (t2 - t0);
    const b1z = ((t2 - u) * a1z + (u - t0) * a2z) / (t2 - t0);
    const b2x = ((t3 - u) * a2x + (u - t1) * a3x) / (t3 - t1);
    const b2z = ((t3 - u) * a2z + (u - t1) * a3z) / (t3 - t1);
    out.x = ((t2 - u) * b1x + (u - t1) * b2x) / (t2 - t1);
    out.z = ((t2 - u) * b1z + (u - t1) * b2z) / (t2 - t1);
    return out;
  }
}
