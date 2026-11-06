import { respawnProgress } from '../race';
import type { System } from '../world';

/** Reaparición en el último checkpoint (tecla R). El cronómetro sigue corriendo. */
export const respawnSystem: System = (world, input) => {
  if (!input.respawn || world.race.phase !== 'racing') return;
  world.placeAt(respawnProgress(world.race, world.track));
  world.race.wrongWay = false;
  world.race.wrongWaySteps = 0;
};
