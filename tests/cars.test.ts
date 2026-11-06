import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { SIM, STEP_SECONDS } from '../src/data/balance';
import { CARS, CONDOR, GORRION, ZORRO, carById, type CarDef } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import { createCarState, placeCar, stepCar } from '../src/game/car';
import { Track } from '../src/game/track';
import { World } from '../src/game/world';
import { autopilot } from './helpers/autopilot';

/** Velocidad tras acelerar en recta durante `seconds`. */
function speedAfter(def: CarDef, seconds: number): number {
  const car = createCarState();
  placeCar(car, 0, 0, 0);
  const c = createControls();
  c.throttle = 1;
  for (let i = 0; i < seconds / STEP_SECONDS; i++) stepCar(car, def.params, c, STEP_SECONDS);
  return car.forwardSpeed;
}

/** Ángulo girado en 1 s a 20 m/s con la dirección a fondo. */
function turnAt20(def: CarDef): number {
  const car = createCarState();
  placeCar(car, 0, 0, 0);
  car.vx = 20;
  const c = createControls();
  c.throttle = 0.4;
  c.steer = 1;
  for (let i = 0; i < 1 / STEP_SECONDS; i++) stepCar(car, def.params, c, STEP_SECONDS);
  return car.heading;
}

describe('coches', () => {
  it('ids únicos y búsqueda por id', () => {
    expect(new Set(CARS.map((c) => c.id)).size).toBe(CARS.length);
    expect(carById('zorro')).toBe(ZORRO);
    expect(carById('no-existe')).toBeNull();
  });

  it('velocidad punta: Cóndor > Gorrión > Zorro', () => {
    const top = (d: CarDef): number => speedAfter(d, 40);
    expect(top(CONDOR)).toBeGreaterThan(top(GORRION));
    expect(top(GORRION)).toBeGreaterThan(top(ZORRO));
  });

  it('giro: Zorro > Gorrión > Cóndor', () => {
    expect(turnAt20(ZORRO)).toBeGreaterThan(turnAt20(GORRION));
    expect(turnAt20(GORRION)).toBeGreaterThan(turnAt20(CONDOR));
  });

  it('Zorro acelera mejor desde parado', () => {
    expect(speedAfter(ZORRO, 2)).toBeGreaterThan(speedAfter(CONDOR, 2));
  });

  for (const trackDef of TRACKS) {
    const track = new Track(trackDef);
    for (const carDef of CARS) {
      it(`${carDef.name} completa una vuelta en ${trackDef.name}`, () => {
        const world = new World(track, carDef, null);
        const controls = createControls();
        for (let s = 0; s < SIM.hz * 300 && world.race.lapsCompleted < 1; s++) {
          autopilot(world, controls);
          world.step({ controls, respawn: false });
        }
        expect(world.race.lapsCompleted).toBe(1);
      });
    }
  }
});
