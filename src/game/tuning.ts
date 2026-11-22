import { CAR_PARAM_CEILING, CAR_PARAM_KEYS, CAR_PARAM_TUNING, type CarParams } from '../data/cars';
import { clamp } from '../core/math';

/**
 * Ajuste en vivo de la física (solo desde el panel de depuración). Un valor no numérico se rechaza
 * (devuelve null) y uno fuera de rango se recorta al rango permitido para ese parámetro.
 */
export function clampCarParam(key: keyof CarParams, value: number, base: CarParams): number | null {
  if (!Number.isFinite(value)) return null;
  const reference = base[key];
  const ceiling = CAR_PARAM_CEILING[key] ?? Infinity;
  const min = Math.min(reference * CAR_PARAM_TUNING.minFactor, ceiling);
  const max = Math.min(reference * CAR_PARAM_TUNING.maxFactor, ceiling);
  return clamp(value, min, max);
}

/** Indica si todos los parámetros coinciden con los del coche. */
export function paramsMatch(params: CarParams, base: CarParams): boolean {
  return CAR_PARAM_KEYS.every((key) => params[key] === base[key]);
}
