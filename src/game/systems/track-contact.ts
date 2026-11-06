import { resolveTrackContact } from '../car';
import type { System } from '../world';

/** Superficie bajo el coche y choque con los muros. */
export const trackContactSystem: System = (world, _input, dt) => {
  resolveTrackContact(world.car, world.params, world.track, world.query, dt);
};
