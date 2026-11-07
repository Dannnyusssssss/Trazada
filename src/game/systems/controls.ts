import { resetControls } from '../../core/input';
import { ASSISTS } from '../../data/balance';
import { applyBrakingAssist, applySteeringAssist } from '../assists';
import { centerlineProfile } from '../racing-line';
import type { System } from '../world';

/**
 * Controles de cada coche en este paso: los del jugador (con sus asistencias, si las tiene activas) y los
 * que calcula la IA para los rivales. Durante la cuenta atrás ningún coche responde.
 * Los rivales siguen conduciendo después de cruzar la meta para no quedarse parados en la pista.
 */
export const controlSystem: System = (world, input, dt) => {
  for (const racer of world.racers) {
    const controls = racer.controls;
    const phase = racer.race.phase;
    const driver = world.drivers[racer.index];
    if (phase === 'countdown' || (phase === 'finished' && !driver)) {
      resetControls(controls);
      continue;
    }
    if (driver) {
      driver.drive(world, racer, controls, dt);
      continue;
    }
    controls.throttle = input.controls.throttle;
    controls.brake = input.controls.brake;
    controls.steer = input.controls.steer;
    controls.handbrake = input.controls.handbrake;
    const assists = world.assists;
    const state = world.assistState;
    if (assists.braking) {
      state.brakeProfile ??= centerlineProfile(
        world.track,
        racer.params,
        ASSISTS.brakeLateralAccel,
        racer.params.brakeDecel * ASSISTS.brakeUse,
      );
      const speed = racer.car.forwardSpeed;
      // Velocidad prudente: la menor entre el punto actual y el que se alcanzará en medio segundo.
      const profile = state.brakeProfile;
      const here = profile[racer.query.index] ?? Infinity;
      const later = world.track.indexAt(racer.query.progress + Math.max(0, speed) * 0.5);
      applyBrakingAssist(controls, speed, Math.min(here, profile[later] ?? Infinity));
    }
    if (assists.steering) {
      applySteeringAssist(controls, state, racer.car.forwardSpeed, racer.params, dt);
    } else {
      state.steer = controls.steer;
    }
  }
};
