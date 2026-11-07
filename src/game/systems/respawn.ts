import { ASSISTS, RACE, SIM } from '../../data/balance';
import { updateStuck } from '../assists';
import { respawnProgress } from '../race';
import type { Racer } from '../racer';
import type { System, World } from '../world';

/** Coloca un coche justo después de su último checkpoint, parado y centrado. El cronómetro sigue. */
function respawn(world: World, racer: Racer): void {
  const progress = respawnProgress(racer.race, world.track);
  world.placeRacer(racer, progress, 0);
  // La distancia de la vuelta vuelve a la del checkpoint (siempre por delante de la meta).
  racer.race.lapDistance = progress;
  racer.race.wrongWay = false;
  racer.race.wrongWaySteps = 0;
  racer.stuckSteps = 0;
  // Si hay otro coche en ese punto, no chocan hasta separarse.
  racer.noCollide = world.racers.length > 1;
}

/**
 * Reaparición: con la tecla R (jugador) o sola si el coche lleva un rato atascado (los rivales siempre;
 * el jugador solo si tiene activa la ayuda de reaparición automática).
 */
export const respawnSystem: System = (world, input) => {
  for (const racer of world.racers) {
    if (racer.race.phase === 'countdown') continue;
    const isPlayer = racer === world.player;
    if (isPlayer && racer.race.phase !== 'racing') continue;
    if (isPlayer && input.respawn) {
      respawn(world, racer);
      continue;
    }
    racer.stuckSteps = updateStuck(
      racer.stuckSteps,
      racer.car.forwardSpeed,
      racer.controls,
      RACE.stuckSpeed,
    );
    let limitSeconds: number = RACE.aiStuckSeconds;
    if (isPlayer) limitSeconds = world.assists.autoRespawn ? ASSISTS.stuckSeconds : Infinity;
    if (racer.stuckSteps >= limitSeconds * SIM.hz) respawn(world, racer);
  }
};
