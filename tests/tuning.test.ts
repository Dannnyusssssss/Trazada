import { describe, expect, it } from 'vitest';
import { CAR_PARAM_KEYS, CAR_PARAM_TUNING, GORRION, ZORRO } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import { Track } from '../src/game/track';
import { clampCarParam, paramsMatch } from '../src/game/tuning';
import { World } from '../src/game/world';

const def = TRACKS[0];
if (!def) throw new Error('sin circuitos');
const track = new Track(def);
const base = GORRION.params;

describe('clampCarParam', () => {
  it('rechaza valores no numéricos', () => {
    expect(clampCarParam('maxSpeed', Number.NaN, base)).toBeNull();
    expect(clampCarParam('maxSpeed', Infinity, base)).toBeNull();
    expect(clampCarParam('maxSpeed', Number('abc'), base)).toBeNull();
  });

  it('recorta valores enormes, negativos o nulos al rango del parámetro', () => {
    expect(clampCarParam('maxSpeed', 1e308, base)).toBe(base.maxSpeed * CAR_PARAM_TUNING.maxFactor);
    expect(clampCarParam('maxSpeed', -5, base)).toBe(base.maxSpeed * CAR_PARAM_TUNING.minFactor);
    expect(clampCarParam('maxSpeed', 0, base)).toBeGreaterThan(0);
  });

  it('respeta el tope de las fracciones', () => {
    expect(clampCarParam('turnHighSpeedReduction', 3, base)).toBeLessThan(1);
  });

  it('el valor del propio coche siempre está dentro del rango', () => {
    for (const key of CAR_PARAM_KEYS) expect(clampCarParam(key, base[key], base)).toBe(base[key]);
  });
});

describe('paramsMatch', () => {
  it('compara todos los parámetros', () => {
    expect(paramsMatch({ ...base }, base)).toBe(true);
    expect(paramsMatch({ ...base, lateralGrip: base.lateralGrip + 1 }, base)).toBe(false);
    expect(paramsMatch(ZORRO.params, base)).toBe(false);
  });
});

describe('World con la física cambiada para depurar', () => {
  it('una sesión normal se puede guardar', () => {
    const world = new World(track, GORRION, null);
    expect(world.tuned).toBe(false);
    expect(world.canRecord).toBe(true);
  });

  it('cambiar un parámetro marca la sesión y no deja guardar', () => {
    const world = new World(track, GORRION, null);
    const applied = world.setParam('maxSpeed', 1e308);
    expect(applied).toBe(base.maxSpeed * CAR_PARAM_TUNING.maxFactor);
    expect(world.params.maxSpeed).toBe(applied);
    expect(world.canRecord).toBe(false);
  });

  it('un valor inválido no cambia nada ni marca la sesión', () => {
    const world = new World(track, GORRION, null);
    expect(world.setParam('maxSpeed', Number.NaN)).toBe(base.maxSpeed);
    expect(world.tuned).toBe(false);
  });

  it('restablecer no desmarca la sesión en curso; reiniciar con la física original sí', () => {
    const world = new World(track, GORRION, null);
    world.setParam('engineAccel', base.engineAccel * 2);
    world.resetParams();
    expect(world.params.engineAccel).toBe(base.engineAccel);
    expect(world.canRecord).toBe(false);
    world.reset();
    expect(world.canRecord).toBe(true);
  });

  it('reiniciar con la física cambiada mantiene la sesión marcada', () => {
    const world = new World(track, GORRION, null);
    world.setParam('lateralGrip', base.lateralGrip * 2);
    world.reset();
    expect(world.canRecord).toBe(false);
  });

  it('cambiar la física no modifica los datos del coche', () => {
    const world = new World(track, GORRION, null);
    world.setParam('turnRate', base.turnRate * 3);
    expect(GORRION.params.turnRate).toBe(base.turnRate);
  });
});

describe('Mejor vuelta tras una sesión con la física cambiada', () => {
  it('no se lleva a la sesión siguiente', () => {
    const world = new World(track, GORRION, 60000);
    world.setParam('maxSpeed', base.maxSpeed * 4);
    world.race.bestLapMs = 1000;
    world.resetParams();
    world.reset();
    expect(world.race.bestLapMs).toBe(60000);
  });

  it('la de una sesión normal sí se conserva', () => {
    const world = new World(track, GORRION, 60000);
    world.race.bestLapMs = 50000;
    world.reset();
    expect(world.race.bestLapMs).toBe(50000);
  });
});
