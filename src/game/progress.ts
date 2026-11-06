import type { TrackDef } from '../data/tracks';

export type Medal = 'gold' | 'silver' | 'bronze';

/** Medalla que corresponde a un tiempo de vuelta (ms), o null si no llega al bronce. */
export function medalFor(def: TrackDef, lapMs: number | null): Medal | null {
  if (lapMs === null || !Number.isFinite(lapMs)) return null;
  if (lapMs <= def.medals.gold) return 'gold';
  if (lapMs <= def.medals.silver) return 'silver';
  if (lapMs <= def.medals.bronze) return 'bronze';
  return null;
}

/** Mejor vuelta de un circuito con cualquier coche. */
export function bestOnTrack(
  bestLaps: Readonly<Record<string, Readonly<Record<string, number>>>>,
  trackId: string,
): number | null {
  const entry = bestLaps[trackId];
  if (!entry) return null;
  let best: number | null = null;
  for (const ms of Object.values(entry)) if (best === null || ms < best) best = ms;
  return best;
}

/** El primer circuito está siempre abierto; cada uno de los siguientes se abre con el bronce del anterior. */
export function isTrackUnlocked(
  tracks: readonly TrackDef[],
  index: number,
  bestLaps: Readonly<Record<string, Readonly<Record<string, number>>>>,
): boolean {
  if (index <= 0) return true;
  const previous = tracks[index - 1];
  if (!previous || index >= tracks.length) return false;
  return medalFor(previous, bestOnTrack(bestLaps, previous.id)) !== null;
}
