import { resetControls } from '../../core/input';
import { stepCar } from '../car';
import type { System } from '../world';

/** Física del coche. Durante la cuenta atrás el coche no responde a los controles. */
export const carPhysicsSystem: System = (world, input, dt) => {
  const controls = world.appliedControls;
  if (world.race.phase === 'racing') {
    controls.throttle = input.controls.throttle;
    controls.brake = input.controls.brake;
    controls.steer = input.controls.steer;
    controls.handbrake = input.controls.handbrake;
  } else {
    resetControls(controls);
  }
  stepCar(world.car, world.params, controls, dt);
};
