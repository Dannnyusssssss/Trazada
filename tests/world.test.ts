import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { RACE, SIM } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import { Track } from '../src/game/track';
import { SYSTEMS, World } from '../src/game/world';
import { autopilot } from './helpers/autopilot';

const def = TRACKS[0];
if (!def) throw new Error('sin circuitos');
const track = new Track(def);

describe('World', () => {
  it('declara los sistemas en orden fijo', () => {
    expect(SYSTEMS.length).toBe(5);
  });

  it('el coche no se mueve durante la cuenta atrás', () => {
    const world = new World(track, GORRION, null);
    const controls = createControls();
    controls.throttle = 1;
    const x = world.car.x;
    for (let i = 0; i < RACE.countdownSeconds * SIM.hz - 1; i++) {
      world.step({ controls, respawn: false });
    }
    expect(world.car.x).toBe(x);
    expect(world.race.phase).toBe('countdown');
    world.step({ controls, respawn: false });
    world.step({ controls, respawn: false });
    expect(world.race.phase).toBe('racing');
    expect(world.car.forwardSpeed).toBeGreaterThan(0);
  });

  for (const trackDef of TRACKS) {
    it(`${trackDef.name}: el piloto automático completa dos vueltas con tiempos razonables`, () => {
      const world = new World(new Track(trackDef), GORRION, null);
      const controls = createControls();
      let steps = 0;
      while (world.race.lapsCompleted < 2 && steps < SIM.hz * 400) {
        autopilot(world, controls);
        world.step({ controls, respawn: false });
        steps++;
      }
      expect(world.race.lapsCompleted).toBe(2);
      const lap = world.race.lastLapMs ?? 0;
      expect(lap).toBeGreaterThan(20_000);
      expect(lap).toBeLessThan(150_000);
    });
  }

  it('es determinista con la misma entrada', () => {
    const a = new World(track, GORRION, null);
    const b = new World(track, GORRION, null);
    const ca = createControls();
    const cb = createControls();
    for (let i = 0; i < SIM.hz * 40; i++) {
      autopilot(a, ca);
      autopilot(b, cb);
      const respawn = i === SIM.hz * 20;
      a.step({ controls: ca, respawn });
      b.step({ controls: cb, respawn });
    }
    expect(a.car).toEqual(b.car);
    expect(a.race).toEqual(b.race);
  });

  it('reaparece en el último checkpoint con R y el cronómetro sigue', () => {
    const world = new World(track, GORRION, null);
    const controls = createControls();
    for (let i = 0; i < SIM.hz * 20; i++) {
      autopilot(world, controls);
      world.step({ controls, respawn: false });
    }
    const last = world.race.lastCheckpoint;
    const lapSteps = world.race.lapSteps;
    const teleports = world.teleports;
    world.step({ controls, respawn: true });
    expect(world.teleports).toBe(teleports + 1);
    expect(world.race.lastCheckpoint).toBe(last);
    expect(world.race.lapSteps).toBe(lapSteps + 1);
    expect(Math.abs(world.query.lateral)).toBeLessThan(1);
    expect(world.car.forwardSpeed).toBeLessThan(1);
  });

  it('reset vuelve a la parrilla y conserva la mejor vuelta', () => {
    const world = new World(track, GORRION, 45_000);
    world.race.bestLapMs = 44_000;
    world.reset();
    expect(world.race.bestLapMs).toBe(44_000);
    expect(world.race.phase).toBe('countdown');
  });
});
