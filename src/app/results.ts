import { TRACKS } from '../data/tracks';
import { isTrackUnlocked, medalFor } from '../game/progress';
import { stepsToMs } from '../game/race';
import type { World } from '../game/world';
import type { SaveStore } from '../save/storage';
import type { RaceResults, ResultsData, Standing } from '../ui/results-screen';

/** Lo que se anota al empezar cada sesión para saber al final qué ha cambiado. */
export interface SessionStart {
  /** Récord de vuelta del circuito y coche al empezar (ms), o null. */
  recordAtStart: number | null;
  /** Qué circuitos estaban desbloqueados al empezar (en el orden de `TRACKS`). */
  unlockedAtStart: boolean[];
}

/**
 * Construye los datos de la pantalla de resultados al terminar una sesión. En Carrera también guarda el
 * puesto final; con la física cambiada desde el panel de depuración (`world.canRecord` falso) no se guarda
 * el puesto ni se anuncia un récord nuevo.
 */
export function buildResults(world: World, store: SaveStore, start: SessionStart): ResultsData {
  const race = world.race;
  const def = world.track.def;
  const bestLaps = store.data.bestLaps;
  const index = TRACKS.findIndex((t) => t.id === def.id);
  const nextDef = TRACKS[index + 1];
  const nextUnlocked = nextDef !== undefined && isTrackUnlocked(TRACKS, index + 1, bestLaps);
  const session = race.sessionBestMs;
  let raceResults: RaceResults | null = null;
  if (world.mode === 'race') {
    const position = world.positionOf(world.player);
    // Solo se celebra al mejorar un puesto anterior (no la primera carrera, que siempre es "récord").
    const previousBest = store.getRaceBest(def.id, world.difficulty);
    const improved =
      world.canRecord && store.recordRacePosition(def.id, world.difficulty, position);
    const newBestPosition = improved && previousBest !== null;
    const standings: Standing[] = world.order.map((i) => {
      const racer = world.racers[i];
      return {
        name: racer?.name ?? '',
        timeMs: racer && racer.race.phase === 'finished' ? stepsToMs(racer.race.raceSteps) : null,
        isPlayer: racer === world.player,
      };
    });
    raceResults = {
      position,
      total: world.racers.length,
      totalMs: stepsToMs(race.raceSteps),
      standings,
      bestPosition: store.getRaceBest(def.id, world.difficulty),
      newBestPosition,
    };
  }
  return {
    trackName: def.name,
    carName: world.carDef.name,
    lapTimes: race.lapTimes,
    sessionBestMs: session,
    // Una sesión con la física cambiada no obtiene medalla.
    medal: world.canRecord ? medalFor(def, session) : null,
    recordMs: store.getBestLap(def.id, world.carDef.id),
    newRecord:
      world.mode === 'timeTrial' &&
      world.canRecord &&
      session !== null &&
      (start.recordAtStart === null || session < start.recordAtStart),
    unlockedTrack:
      nextDef && nextUnlocked && start.unlockedAtStart[index + 1] === false ? nextDef.name : null,
    hasNext: nextUnlocked,
    race: raceResults,
    tuned: world.tuned,
  };
}
