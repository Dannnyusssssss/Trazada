import { updateCountdown } from '../race';
import type { System } from '../world';

/** Cuenta atrás de la salida. */
export const countdownSystem: System = (world) => {
  updateCountdown(world.race);
};
