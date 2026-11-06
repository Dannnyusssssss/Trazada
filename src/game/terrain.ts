import { clamp, lerp } from '../core/math';
import { TERRAIN } from '../data/balance';
import type { Track } from './track';

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Altura del entorno lejano: por debajo del punto más bajo de la pista, para no taparla nunca. */
export function baseTerrainHeight(track: Track): number {
  return track.minHeight - TERRAIN.belowTrack - 1;
}

/**
 * Altura del terreno (solo visual) en (x, z). Bajo la zona circulable queda un poco por debajo de la pista
 * (que se dibuja con su propia malla); fuera del muro pasa suavemente a la altura del entorno.
 */
export function terrainHeight(track: Track, x: number, z: number): number {
  const i = track.nearestIndex(x, z);
  const tx = track.tx[i] ?? 1;
  const tz = track.tz[i] ?? 0;
  const ox = x - track.x(i);
  const oz = z - track.z(i);
  const lateral = ox * tz - oz * tx;
  const distance = Math.hypot(ox, oz);
  const wall = track.wallDistance;
  const edge = track.heightAt(i, clamp(lateral, -wall, wall)) - TERRAIN.belowTrack;
  if (distance <= wall + 1) return edge;
  const t = smoothstep((distance - wall - 1) / TERRAIN.blendDistance);
  return lerp(edge, baseTerrainHeight(track), t);
}
