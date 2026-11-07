import { resolveTrackContact } from '../car';
import type { System } from '../world';

/** Superficie bajo cada coche y choque con los muros. */
export const trackContactSystem: System = (world, _input, dt) => {
  for (const racer of world.racers) {
    resolveTrackContact(racer.car, racer.params, world.track, racer.query, dt);
  }
};
