import { Rng } from '../core/rng';
import type { SceneryKind } from '../data/tracks';
import { terrainHeight } from './terrain';
import type { Track } from './track';

export type SceneryItemKind = SceneryKind | 'lamp';

/** Un objeto del escenario ya colocado. */
export interface SceneryItem {
  kind: SceneryItemKind;
  x: number;
  y: number;
  z: number;
  /** Rotación alrededor del eje vertical (rad, mismo convenio que `rotation.y`). */
  rotation: number;
  scale: number;
  /** Índice de color o de variante dentro de la paleta. */
  variant: number;
}

/** Radio aproximado de la base de cada tipo a escala 1 (m), para no invadir la pista. */
export const FOOTPRINT: Readonly<Record<SceneryItemKind, number>> = {
  pine: 1.6,
  broadleaf: 2.6,
  rock: 1.6,
  building: 9,
  lamp: 0.4,
};

/** Separación mínima entre edificios (m), para que no se solapen. */
const BUILDING_SPACING = 17;

/** Distancia (m) del punto (x, z) a la línea central más cercana. */
export function distanceToTrack(track: Track, x: number, z: number): number {
  const i = track.nearestIndex(x, z);
  return Math.hypot(x - track.x(i), z - track.z(i));
}

/**
 * Coloca el escenario de un circuito con el RNG de su semilla: siempre el mismo resultado.
 * Ningún objeto queda a menos de su radio + la distancia mínima de su regla desde el muro.
 */
export function placeScenery(track: Track): SceneryItem[] {
  const def = track.def;
  const rng = new Rng((def.seed ^ 0x5bd1e995) >>> 0);
  const items: SceneryItem[] = [];
  const n = track.sampleCount;
  const wall = track.wallDistance;

  for (const rule of def.scenery) {
    let placed = 0;
    for (let attempt = 0; attempt < rule.count * 25 && placed < rule.count; attempt++) {
      const i = rng.int(0, n - 1);
      const side = rng.next() < 0.5 ? 1 : -1;
      const scale = rng.range(rule.scaleMin, rule.scaleMax);
      const clearance = wall + rule.minDistance + FOOTPRINT[rule.kind] * scale;
      const offset = rng.range(clearance, wall + rule.maxDistance);
      const tx = track.tx[i] ?? 1;
      const tz = track.tz[i] ?? 0;
      // Normal izquierda (tz, -tx) por el lado elegido.
      const x = track.x(i) + tz * offset * side;
      const z = track.z(i) - tx * offset * side;
      const rotationJitter = rng.range(-Math.PI, Math.PI);
      const variant = rng.int(0, 7);
      if (distanceToTrack(track, x, z) < clearance) continue;
      // Los edificios miran a la pista y no se solapan entre sí.
      let rotation = rotationJitter;
      if (rule.kind === 'building') {
        if (
          items.some(
            (o) =>
              o.kind === 'building' &&
              Math.hypot(o.x - x, o.z - z) < BUILDING_SPACING * Math.max(scale, o.scale),
          )
        ) {
          continue;
        }
        rotation = Math.atan2(tx, tz);
      }
      items.push({
        kind: rule.kind,
        x,
        y: terrainHeight(track, x, z),
        z,
        rotation,
        scale,
        variant,
      });
      placed++;
    }
  }

  // Farolas a intervalos regulares por ambos lados, junto al muro.
  if (def.lampSpacing > 0) {
    const every = Math.max(1, Math.round(def.lampSpacing / track.spacing));
    for (let i = 0; i < n; i += every) {
      const tx = track.tx[i] ?? 1;
      const tz = track.tz[i] ?? 0;
      for (const side of [1, -1]) {
        const lateral = side * (wall + 1.2);
        const x = track.x(i) + tz * lateral;
        const z = track.z(i) - tx * lateral;
        if (distanceToTrack(track, x, z) < wall + 1) continue;
        // El brazo de la farola apunta hacia la pista.
        const rotation = Math.atan2(-tz * side, tx * side);
        items.push({
          kind: 'lamp',
          x,
          y: terrainHeight(track, x, z),
          z,
          rotation,
          scale: 1,
          variant: (i / every + (side > 0 ? 0 : 1)) % 4,
        });
      }
    }
  }
  return items;
}
