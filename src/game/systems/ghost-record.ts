import { GHOST_STEP } from '../ghost';
import type { System } from '../world';

/**
 * Grabación del fantasma: empieza con la salida, toma una muestra cada GHOST_STEP pasos de vuelta y,
 * al completar una vuelta, deja la grabación en `world.lastGhost` y empieza la siguiente.
 */
export const ghostRecordSystem: System = (world) => {
  const race = world.race;
  const recorder = world.recorder;
  if (world.lapCompletedThisStep) {
    const lapMs = race.lastLapMs;
    const data =
      lapMs === null ? null : recorder.finish(world.track.def.id, world.carDef.id, lapMs);
    if (data) {
      world.lastGhost = data;
      world.ghostVersion++;
    }
    // La vuelta siguiente empieza en este mismo paso (paso 0 de la vuelta).
    if (race.phase === 'racing') recorder.start(world.car);
    return;
  }
  if (race.phase !== 'racing') return;
  if (!recorder.active) {
    // Primera vuelta: se empieza a grabar en el paso de la salida.
    if (race.lapsCompleted === 0 && race.lapSteps <= 1) recorder.start(world.car);
    return;
  }
  if (race.lapSteps % GHOST_STEP === 0) recorder.record(world.car);
};
