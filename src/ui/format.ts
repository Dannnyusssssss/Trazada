import { TEXTS } from '../data/texts';
import type { Medal } from '../game/progress';

/** Formatea un tiempo en milisegundos como m:ss.mmm. Null o valores no válidos dan un marcador vacío. */
export function formatLapTime(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return TEXTS.hud.emptyTime;
  const total = Math.floor(ms);
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** Diferencia con el fantasma en segundos, siempre con signo: "+0.42" (más lento) o "−1.05" (más rápido). */
export function formatDelta(ms: number): string {
  const seconds = Math.abs(ms) / 1000;
  return `${ms < 0 ? '−' : '+'}${seconds.toFixed(2)}`;
}

/** Nombre de la medalla (o "Sin medalla"). */
export function medalName(medal: Medal | null): string {
  return medal === null ? TEXTS.medals.none : TEXTS.medals[medal];
}

/**
 * Puntuación de 1 a 5 de un valor dentro del rango de todos los coches (para la pantalla de selección).
 * El texto usa puntos llenos y vacíos: "●●●○○".
 */
export function statDots(value: number, min: number, max: number): string {
  const level = max > min ? 2 + Math.round((3 * (value - min)) / (max - min)) : 3;
  return '●'.repeat(level) + '○'.repeat(5 - level);
}

/** Velocidad en km/h, redondeada y sin signo. */
export function formatSpeed(metersPerSecond: number): string {
  return String(Math.round(Math.abs(metersPerSecond) * 3.6));
}
