import { updateProgress, updateWrongWay } from '../race';
import type { System } from '../world';

/** Cronómetro, checkpoints, vueltas y aviso de contramano. */
export const raceSystem: System = (world) => {
  const race = world.race;
  if (race.phase !== 'racing') return;
  race.raceSteps++;
  race.lapSteps++;
  world.lapCompletedThisStep = updateProgress(race, world.track, world.query.progress);
  updateWrongWay(race, world.car, world.query);
};
