import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { AI, DIFFICULTIES, RACE, SIM } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import { Track } from '../src/game/track';
import { World } from '../src/game/world';
import { autopilot } from './helpers/autopilot';

/** Corre una carrera completa con el piloto automático como jugador. Devuelve el mundo al terminar. */
function runRace(
  world: World,
  playerLateralAccel: number,
  onStep?: (world: World) => void,
): { world: World; steps: number } {
  const controls = createControls();
  let steps = 0;
  const limit = SIM.hz * 420;
  while (steps < limit && world.racers.some((r) => r.race.phase !== 'finished')) {
    autopilot(world, controls, playerLateralAccel);
    world.step({ controls, respawn: false });
    onStep?.(world);
    steps++;
  }
  return { world, steps };
}

const tracks = new Map(TRACKS.map((def) => [def.id, new Track(def)]));
function trackOf(id: string): Track {
  const track = tracks.get(id);
  if (!track) throw new Error(id);
  return track;
}

describe('IA: recorrido por circuito y dificultad', () => {
  for (const def of TRACKS) {
    for (const difficulty of DIFFICULTIES) {
      it(`${def.name} (${difficulty}): los 5 rivales terminan 3 vueltas a su ritmo y sin atascarse`, () => {
        const world = new World(trackOf(def.id), GORRION, null, {
          mode: 'race',
          difficulty,
          seed: 11,
        });
        const teleportsAtStart = world.racers.map((r) => r.teleports);
        let maxSpeedSeen = 0;
        const { world: done } = runRace(world, 11, (w) => {
          for (const r of w.racers) {
            if (r.kind !== 'ai') continue;
            // Misma física: nunca superan la velocidad máxima de su coche.
            maxSpeedSeen = Math.max(maxSpeedSeen, r.car.forwardSpeed / r.params.maxSpeed);
          }
        });
        const level = AI.levels[difficulty];
        const paceMs =
          def.medals.gold * level.pace.gold +
          def.medals.silver * level.pace.silver +
          def.medals.bronze * level.pace.bronze;
        for (const racer of done.racers) {
          if (racer.kind !== 'ai') continue;
          expect(racer.race.phase, racer.name).toBe('finished');
          expect(racer.race.lapsCompleted).toBe(RACE.raceLaps);
          // Ninguno necesitó reaparecer (no se quedó atascado).
          expect(racer.teleports, racer.name).toBe(teleportsAtStart[racer.index]);
          // Su mejor vuelta queda cerca del ritmo de la dificultad.
          const best = Math.min(...racer.race.lapTimes);
          expect(best, racer.name).toBeGreaterThan(paceMs * 0.94);
          expect(best, racer.name).toBeLessThan(paceMs * 1.1);
        }
        expect(maxSpeedSeen).toBeLessThanOrEqual(1);
      });
    }
  }
});

describe('IA: se puede ganar', () => {
  for (const def of TRACKS) {
    it(`${def.name}: un piloto rápido gana en Fácil y en Normal`, () => {
      for (const difficulty of ['easy', 'normal'] as const) {
        const world = new World(trackOf(def.id), GORRION, null, {
          mode: 'race',
          difficulty,
          seed: 5,
        });
        const { world: done } = runRace(world, 14);
        expect(done.positionOf(done.player), difficulty).toBe(1);
      }
    });

    it(`${def.name}: en Difícil los rivales van algo más lentos que el oro (se puede ganar)`, () => {
      const world = new World(trackOf(def.id), GORRION, null, {
        mode: 'race',
        difficulty: 'hard',
        seed: 3,
      });
      const { world: done } = runRace(world, 14);
      for (const racer of done.racers) {
        if (racer.kind !== 'ai') continue;
        expect(Math.min(...racer.race.lapTimes), racer.name).toBeGreaterThan(def.medals.gold);
      }
    });
  }
});

describe('IA: determinismo y ayuda limitada', () => {
  const track = trackOf('valle-solar');

  it('la misma semilla y la misma entrada dan la misma carrera', () => {
    const a = new World(track, GORRION, null, { mode: 'race', seed: 42 });
    const b = new World(track, GORRION, null, { mode: 'race', seed: 42 });
    const ca = createControls();
    const cb = createControls();
    for (let i = 0; i < SIM.hz * 30; i++) {
      autopilot(a, ca);
      autopilot(b, cb);
      a.step({ controls: ca, respawn: false });
      b.step({ controls: cb, respawn: false });
    }
    for (let i = 0; i < a.racers.length; i++) {
      expect(a.racers[i]?.car).toEqual(b.racers[i]?.car);
    }
    expect(a.order).toEqual(b.order);
  });

  it('otra semilla cambia un poco a los rivales', () => {
    const a = new World(track, GORRION, null, { mode: 'race', seed: 1 });
    const b = new World(track, GORRION, null, { mode: 'race', seed: 2 });
    const biasA = a.drivers.map((d) => d?.bias ?? 0);
    const biasB = b.drivers.map((d) => d?.bias ?? 0);
    expect(biasA).not.toEqual(biasB);
  });

  it('la ayuda limitada nunca pasa de su tope', () => {
    const world = new World(track, GORRION, null, { mode: 'race', difficulty: 'normal', seed: 9 });
    const controls = createControls();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < SIM.hz * 60; i++) {
      // El jugador se queda parado: los rivales se escapan y la ayuda los frena un poco, sin pasarse.
      world.step({ controls, respawn: false });
      for (const driver of world.drivers) {
        if (!driver) continue;
        min = Math.min(min, driver.rubberBand);
        max = Math.max(max, driver.rubberBand);
      }
    }
    expect(min).toBeGreaterThanOrEqual(1 - AI.rubberBand - 1e-9);
    expect(max).toBeLessThanOrEqual(1 + AI.rubberBand + 1e-9);
    expect(min).toBeLessThan(1);
  });
});
