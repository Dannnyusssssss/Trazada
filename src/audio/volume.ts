/**
 * Volúmenes de la mezcla como lógica pura: cada bus (música, efectos) tiene su propio volumen 0–100 que
 * multiplica su nivel base, antes del volumen general y del limitador.
 */

/** Ganancia de un bus: su nivel base por el volumen (0–100) recortado. Valores no finitos cuentan como 0. */
export function busGain(level: number, volumePct: number): number {
  if (!Number.isFinite(level) || !Number.isFinite(volumePct)) return 0;
  return Math.max(0, level) * (Math.min(100, Math.max(0, volumePct)) / 100);
}
