import { updateCountdown } from '../race';
import type { System } from '../world';

/** Cuenta atrás de la salida (todos los coches salen a la vez). */
export const countdownSystem: System = (world) => {
  for (const racer of world.racers) updateCountdown(racer.race);
};
