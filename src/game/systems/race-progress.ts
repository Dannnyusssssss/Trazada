import { updateProgress, updateWrongWay } from '../race';
import type { System } from '../world';

/** Cronómetro, checkpoints, vueltas y aviso de contramano de cada coche, y orden de carrera. */
export const raceSystem: System = (world) => {
  for (const racer of world.racers) {
    const race = racer.race;
    if (race.phase !== 'racing') continue;
    race.raceSteps++;
    race.lapSteps++;
    racer.lapCompletedThisStep = updateProgress(race, world.track, racer.query.progress);
    updateWrongWay(race, racer.car, racer.query);
  }
  if (world.racers.length > 1) world.updateOrder();
};
