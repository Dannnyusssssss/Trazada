import { respawnProgress } from '../race';
import type { System } from '../world';

/** Reaparición en el último checkpoint (tecla R). El cronómetro sigue corriendo. */
export const respawnSystem: System = (world, input) => {
  if (!input.respawn || world.race.phase !== 'racing') return;
  const progress = respawnProgress(world.race, world.track);
  world.placeAt(progress);
  // La distancia de la vuelta vuelve a la del checkpoint (siempre por delante de la meta).
  world.race.lapDistance = progress;
  world.race.wrongWay = false;
  world.race.wrongWaySteps = 0;
};
