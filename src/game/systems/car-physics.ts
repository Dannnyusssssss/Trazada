import { stepCar } from '../car';
import type { System } from '../world';

/** Física de todos los coches con los controles decididos en este paso. */
export const carPhysicsSystem: System = (world, _input, dt) => {
  for (const racer of world.racers) stepCar(racer.car, racer.params, racer.controls, dt);
};
