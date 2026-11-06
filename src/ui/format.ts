import { TEXTS } from '../data/texts';

/** Formatea un tiempo en milisegundos como m:ss.mmm. Null o valores no válidos dan un marcador vacío. */
export function formatLapTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return TEXTS.hud.emptyTime;
  const total = Math.floor(ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Velocidad en km/h, redondeada y sin signo. */
export function formatSpeed(metersPerSecond: number): string {
  return String(Math.round(Math.abs(metersPerSecond) * 3.6));
}
