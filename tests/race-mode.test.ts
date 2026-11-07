import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { GRID, RACE, SIM } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import { carsOverlap } from '../src/game/collision';
import { Track } from '../src/game/track';
import { raceSeed, World } from '../src/game/world';
import { autopilot } from './helpers/autopilot';

const def = TRACKS[0];
if (!def) throw new Error('sin circuitos');
const track = new Track(def);

describe('modo Carrera: parrilla', () => {
  for (const trackDef of TRACKS) {
    it(`${trackDef.name}: 6 coches en el asfalto, sin tocarse y el jugador el último`, () => {
      const world = new World(new Track(trackDef), GORRION, null, { mode: 'race' });
      expect(world.racers.length).toBe(GRID.slots);
      expect(world.player.kind).toBe('player');
      for (const racer of world.racers) {
        expect(racer.query.surface).toBe('asphalt');
        expect(racer.race.phase).toBe('countdown');
        expect(racer.race.totalLaps).toBe(RACE.raceLaps);
      }
      for (let i = 0; i < world.racers.length; i++) {
        for (let j = i + 1; j < world.racers.length; j++) {
          const a = world.racers[i];
          const b = world.racers[j];
          if (!a || !b) continue;
          expect(
            carsOverlap(a.car, a.params.collisionRadius, b.car, b.params.collisionRadius),
          ).toBe(false);
        }
      }
      // El jugador sale el último: es el que menos ha avanzado.
      const minProgress = Math.min(...world.racers.map((r) => r.race.lapDistance));
      expect(world.player.race.lapDistance).toBe(minProgress);
    });
  }

  it('la contrarreloj sigue siendo de un solo coche', () => {
    const world = new World(track, GORRION, null);
    expect(world.racers.length).toBe(1);
    expect(world.mode).toBe('timeTrial');
  });
});

describe('modo Carrera: posiciones', () => {
  it('ordena por distancia recorrida y, al terminar, por orden de llegada', () => {
    const world = new World(track, GORRION, null, { mode: 'race' });
    const [a, b, c] = world.racers;
    if (!a || !b || !c) throw new Error('faltan coches');
    a.race.lapsCompleted = 1;
    a.race.lapDistance = 10;
    b.race.lapsCompleted = 0;
    b.race.lapDistance = 900;
    c.race.phase = 'finished';
    c.race.raceSteps = 5000;
    world.updateOrder();
    expect(world.positionOf(c)).toBe(1);
    expect(world.positionOf(a)).toBe(2);
    expect(world.positionOf(b)).toBe(3);
    // Otro que termina antes que c pasa delante.
    b.race.phase = 'finished';
    b.race.raceSteps = 4000;
    world.updateOrder();
    expect(world.positionOf(b)).toBe(1);
    expect(world.positionOf(c)).toBe(2);
  });

  it('en carrera no se graba fantasma y el jugador termina con una posición válida', () => {
    const world = new World(track, GORRION, null, { mode: 'race', difficulty: 'easy', seed: 4 });
    const controls = createControls();
    for (let s = 0; s < SIM.hz * 400 && world.race.phase !== 'finished'; s++) {
      autopilot(world, controls, 11);
      world.step({ controls, respawn: false });
    }
    expect(world.race.phase).toBe('finished');
    expect(world.ghostVersion).toBe(0);
    expect(world.lastGhost).toBeNull();
    const position = world.positionOf(world.player);
    expect(position).toBeGreaterThanOrEqual(1);
    expect(position).toBeLessThanOrEqual(GRID.slots);
    expect(new Set(world.order).size).toBe(GRID.slots);
  });

  it('un rival atascado reaparece solo en su último control', () => {
    const world = new World(track, GORRION, null, { mode: 'race', seed: 8 });
    const rival = world.racers[1];
    if (!rival) throw new Error('sin rivales');
    // Sin motor no puede moverse aunque acelere: queda atascado.
    rival.params.engineAccel = 0;
    const teleports = rival.teleports;
    const controls = createControls();
    for (let s = 0; s < SIM.hz * (RACE.countdownSeconds + RACE.aiStuckSeconds + 1); s++) {
      world.step({ controls, respawn: false });
    }
    expect(rival.teleports).toBeGreaterThan(teleports);
  });

  it('reiniciar vuelve a la parrilla a todos los coches', () => {
    const world = new World(track, GORRION, null, { mode: 'race', seed: 8 });
    const start = world.racers.map((r) => [r.car.x, r.car.z]);
    const controls = createControls();
    for (let s = 0; s < SIM.hz * 10; s++) {
      autopilot(world, controls);
      world.step({ controls, respawn: false });
    }
    world.reset();
    world.racers.forEach((r, i) => {
      expect(r.car.x).toBeCloseTo(start[i]?.[0] ?? 0, 9);
      expect(r.car.z).toBeCloseTo(start[i]?.[1] ?? 0, 9);
      expect(r.race.phase).toBe('countdown');
    });
  });
});

describe('semilla de carrera', () => {
  it('es determinista y cambia con el circuito, la dificultad y el intento', () => {
    expect(raceSeed('valle-solar', 'normal', 0)).toBe(raceSeed('valle-solar', 'normal', 0));
    const seeds = new Set([
      raceSeed('valle-solar', 'normal', 0),
      raceSeed('valle-solar', 'normal', 1),
      raceSeed('valle-solar', 'hard', 0),
      raceSeed('cumbre', 'normal', 0),
    ]);
    expect(seeds.size).toBe(4);
    expect(Number.isInteger(raceSeed('cumbre', 'easy', 3))).toBe(true);
  });
});
