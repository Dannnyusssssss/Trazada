import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { ASSISTS, RACE, SIM } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import {
  applyBrakingAssist,
  applySteeringAssist,
  createAssistState,
  defaultAssists,
  updateStuck,
} from '../src/game/assists';
import { Track } from '../src/game/track';
import { World } from '../src/game/world';
import { autopilot } from './helpers/autopilot';

const def = TRACKS[0];
if (!def) throw new Error('sin circuitos');
const track = new Track(def);
const dt = 1 / SIM.hz;

describe('ayuda de dirección', () => {
  it('un toque de tecla no da un volantazo: la dirección sube poco a poco', () => {
    const state = createAssistState();
    const controls = createControls();
    controls.steer = 1;
    applySteeringAssist(controls, state, 10, GORRION.params, dt);
    expect(controls.steer).toBeCloseTo(ASSISTS.steerSlew * dt, 9);
    for (let i = 0; i < SIM.hz; i++) {
      controls.steer = 1;
      applySteeringAssist(controls, state, 0, GORRION.params, dt);
    }
    expect(controls.steer).toBeCloseTo(1, 9);
  });

  it('a velocidad máxima reduce la dirección', () => {
    const state = createAssistState();
    const controls = createControls();
    for (let i = 0; i < SIM.hz * 2; i++) {
      controls.steer = -1;
      applySteeringAssist(controls, state, GORRION.params.maxSpeed, GORRION.params, dt);
    }
    expect(controls.steer).toBeCloseTo(-(1 - ASSISTS.steerHighSpeedCut), 6);
  });
});

describe('ayuda de frenado', () => {
  it('por debajo de la velocidad prudente no toca nada', () => {
    const controls = createControls();
    controls.throttle = 1;
    applyBrakingAssist(controls, 20, 25);
    expect(controls.throttle).toBe(1);
    expect(controls.brake).toBe(0);
  });

  it('un poco por encima suelta el acelerador; mucho por encima frena', () => {
    const lift = createControls();
    lift.throttle = 1;
    applyBrakingAssist(lift, 25 + ASSISTS.brakeLiftMargin + 0.5, 25);
    expect(lift.throttle).toBe(0);
    expect(lift.brake).toBe(0);
    const brake = createControls();
    brake.throttle = 1;
    applyBrakingAssist(brake, 25 + ASSISTS.brakeMargin + 4, 25);
    expect(brake.throttle).toBe(0);
    expect(brake.brake).toBeGreaterThan(0.5);
    expect(brake.brake).toBeLessThanOrEqual(1);
  });

  it('nunca acelera por el jugador ni quita su propia frenada', () => {
    const controls = createControls();
    controls.brake = 1;
    applyBrakingAssist(controls, 10, 40);
    expect(controls.throttle).toBe(0);
    expect(controls.brake).toBe(1);
  });

  it('en el mundo, llegar a fondo a una curva frena antes con la ayuda', () => {
    // El piloto automático solo dirige; el acelerador va siempre a fondo y nunca frena.
    const run = (braking: boolean): number => {
      const world = new World(track, GORRION, null);
      world.assists = { ...defaultAssists(), braking };
      const controls = createControls();
      let braked = 0;
      for (let i = 0; i < SIM.hz * 40; i++) {
        autopilot(world, controls);
        controls.throttle = 1;
        controls.brake = 0;
        world.step({ controls, respawn: false });
        if (world.appliedControls.brake > 0) braked++;
      }
      return braked;
    };
    expect(run(false)).toBe(0);
    expect(run(true)).toBeGreaterThan(0);
  });
});

describe('reaparición automática', () => {
  it('cuenta los pasos atascado solo si se intenta mover', () => {
    const controls = createControls();
    expect(updateStuck(5, 0, controls, 1)).toBe(0);
    controls.throttle = 1;
    expect(updateStuck(5, 0.5, controls, 1)).toBe(6);
    expect(updateStuck(5, 3, controls, 1)).toBe(0);
  });

  const stuckWorld = (autoRespawn: boolean): World => {
    const world = new World(track, GORRION, null);
    world.assists = { ...defaultAssists(), autoRespawn };
    // Sin motor el coche no se mueve aunque acelere: queda atascado.
    world.params.engineAccel = 0;
    const controls = createControls();
    controls.throttle = 1;
    for (let i = 0; i < SIM.hz * (RACE.countdownSeconds + ASSISTS.stuckSeconds + 0.5); i++) {
      world.step({ controls, respawn: false });
    }
    return world;
  };

  it('con la ayuda activa, el coche atascado reaparece solo', () => {
    const before = new World(track, GORRION, null).teleports;
    expect(stuckWorld(true).teleports).toBeGreaterThan(before);
  });

  it('sin la ayuda, no reaparece', () => {
    const before = new World(track, GORRION, null).teleports;
    expect(stuckWorld(false).teleports).toBe(before);
  });
});
