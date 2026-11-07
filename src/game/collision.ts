import { CAR_COLLISION } from '../data/balance';
import type { CarState } from './car';

/**
 * Colisión entre dos coches. Cada coche se aproxima con dos círculos (morro y cola) del radio de colisión
 * del coche, así un coche largo no se mete por detrás de otro. Se resuelve el solape más profundo:
 * los dos coches se separan a partes iguales y la velocidad de cierre se reparte con un pequeño rebote,
 * como un empujón entre coches de la misma masa. No hay daño.
 * Devuelve la velocidad de cierre del choque (m/s), o 0 si no se tocan.
 */
export function collideCars(a: CarState, radiusA: number, b: CarState, radiusB: number): number {
  const off = CAR_COLLISION.circleOffset;
  const afx = Math.cos(a.heading) * off;
  const afz = -Math.sin(a.heading) * off;
  const bfx = Math.cos(b.heading) * off;
  const bfz = -Math.sin(b.heading) * off;
  const minDistance = radiusA + radiusB;

  // Descarte rápido: los centros están demasiado lejos para que se toque ningún par de círculos.
  const reach = minDistance + 2 * off;
  const cx = b.x - a.x;
  const cz = b.z - a.z;
  if (cx * cx + cz * cz >= reach * reach) return 0;

  let bestOverlap = 0;
  let nx = 0;
  let nz = 0;
  for (let i = -1; i <= 1; i += 2) {
    const ax = a.x + afx * i;
    const az = a.z + afz * i;
    for (let j = -1; j <= 1; j += 2) {
      const dx = b.x + bfx * j - ax;
      const dz = b.z + bfz * j - az;
      const d = Math.hypot(dx, dz);
      const overlap = minDistance - d;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        if (d > 1e-6) {
          nx = dx / d;
          nz = dz / d;
        } else {
          // Círculos exactamente superpuestos: se separan según la línea entre los centros.
          const c = Math.hypot(cx, cz);
          nx = c > 1e-6 ? cx / c : 1;
          nz = c > 1e-6 ? cz / c : 0;
        }
      }
    }
  }
  if (bestOverlap <= 0) return 0;

  // Separación a partes iguales.
  const half = bestOverlap / 2;
  a.x -= nx * half;
  a.z -= nz * half;
  b.x += nx * half;
  b.z += nz * half;

  // Velocidad relativa en la dirección del choque (negativa si se acercan).
  const relative = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
  if (relative >= 0) return 0;
  const impulse = (-(1 + CAR_COLLISION.restitution) * relative) / 2;
  a.vx -= nx * impulse;
  a.vz -= nz * impulse;
  b.vx += nx * impulse;
  b.vz += nz * impulse;
  syncSpeeds(a);
  syncSpeeds(b);
  return -relative;
}

/** Recalcula la velocidad de avance y la lateral tras cambiar la velocidad (para el HUD y la carrera). */
function syncSpeeds(state: CarState): void {
  const fx = Math.cos(state.heading);
  const fz = -Math.sin(state.heading);
  state.forwardSpeed = state.vx * fx + state.vz * fz;
  state.lateralSpeed = state.vx * fz + state.vz * -fx;
}

/** Indica si dos coches se tocan (sin modificarlos). */
export function carsOverlap(a: CarState, radiusA: number, b: CarState, radiusB: number): boolean {
  const off = CAR_COLLISION.circleOffset;
  const minDistance = radiusA + radiusB;
  for (let i = -1; i <= 1; i += 2) {
    const ax = a.x + Math.cos(a.heading) * off * i;
    const az = a.z - Math.sin(a.heading) * off * i;
    for (let j = -1; j <= 1; j += 2) {
      const bx = b.x + Math.cos(b.heading) * off * j;
      const bz = b.z - Math.sin(b.heading) * off * j;
      if (Math.hypot(bx - ax, bz - az) < minDistance) return true;
    }
  }
  return false;
}
