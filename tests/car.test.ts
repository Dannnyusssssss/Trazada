import { describe, expect, it } from 'vitest';
import { createControls, type CarControls } from '../src/core/input';
import { STEP_SECONDS } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import {
  copyCarState,
  createCarState,
  placeCar,
  resolveTrackContact,
  speedOf,
  stepCar,
  type CarState,
} from '../src/game/car';
import { Track, createTrackQuery } from '../src/game/track';

const P = GORRION.params;

function run(car: CarState, controls: CarControls, seconds: number): void {
  const steps = Math.round(seconds / STEP_SECONDS);
  for (let i = 0; i < steps; i++) stepCar(car, P, controls, STEP_SECONDS);
}

function fresh(): CarState {
  const car = createCarState();
  placeCar(car, 0, 0, 0);
  return car;
}

describe('física del coche', () => {
  it('acelera y no supera la velocidad máxima', () => {
    const car = fresh();
    const c = createControls();
    c.throttle = 1;
    run(car, c, 1);
    expect(car.forwardSpeed).toBeGreaterThan(8);
    run(car, c, 30);
    expect(car.forwardSpeed).toBeGreaterThan(P.maxSpeed * 0.8);
    expect(car.forwardSpeed).toBeLessThanOrEqual(P.maxSpeed);
    // Con rumbo 0 el coche avanza hacia +x.
    expect(car.x).toBeGreaterThan(100);
    expect(Math.abs(car.z)).toBeLessThan(1e-6);
  });

  it('frena hasta parar sin pasar a marcha atrás de inmediato', () => {
    const car = fresh();
    const c = createControls();
    c.throttle = 1;
    run(car, c, 3);
    c.throttle = 0;
    c.brake = 1;
    const v0 = car.forwardSpeed;
    run(car, c, 0.5);
    expect(car.forwardSpeed).toBeLessThan(v0 - 10);
    expect(car.forwardSpeed).toBeGreaterThanOrEqual(-0.5);
  });

  it('da marcha atrás con el freno estando parado, con tope de velocidad', () => {
    const car = fresh();
    const c = createControls();
    c.brake = 1;
    run(car, c, 10);
    expect(car.forwardSpeed).toBeLessThan(-5);
    expect(car.forwardSpeed).toBeGreaterThanOrEqual(-P.maxReverseSpeed);
  });

  it('sin gas se detiene solo por las resistencias', () => {
    const car = fresh();
    const c = createControls();
    c.throttle = 1;
    run(car, c, 2);
    c.throttle = 0;
    run(car, c, 120);
    expect(speedOf(car)).toBeLessThan(0.01);
  });

  it('gira a la izquierda con dirección positiva y a la derecha con negativa', () => {
    const left = fresh();
    const right = fresh();
    const c = createControls();
    c.throttle = 1;
    run(left, c, 2);
    copyCarState(right, left);
    c.steer = 1;
    run(left, c, 1);
    c.steer = -1;
    run(right, c, 1);
    expect(left.heading).toBeGreaterThan(0.3);
    expect(right.heading).toBeLessThan(-0.3);
    // A la izquierda del rumbo 0 está -z.
    expect(left.z).toBeLessThan(0);
    expect(right.z).toBeGreaterThan(0);
  });

  it('parado no gira', () => {
    const car = fresh();
    const c = createControls();
    c.steer = 1;
    run(car, c, 2);
    expect(car.heading).toBeCloseTo(0, 6);
  });

  it('el freno de mano provoca más deslizamiento lateral', () => {
    const normal = fresh();
    const c = createControls();
    c.throttle = 1;
    run(normal, c, 3);
    const drift = createCarState();
    copyCarState(drift, normal);
    c.steer = 1;
    run(normal, c, 0.6);
    c.handbrake = true;
    run(drift, c, 0.6);
    expect(Math.abs(drift.lateralSpeed)).toBeGreaterThan(Math.abs(normal.lateralSpeed) * 1.5);
  });

  it('el césped frena y limita la velocidad', () => {
    const asphalt = fresh();
    const grass = fresh();
    grass.surface = 'grass';
    const c = createControls();
    c.throttle = 1;
    run(asphalt, c, 10);
    run(grass, c, 10);
    expect(grass.forwardSpeed).toBeLessThan(asphalt.forwardSpeed * 0.6);
    // Entrar al césped a toda velocidad hace perder velocidad aunque se siga acelerando.
    const v = asphalt.forwardSpeed;
    asphalt.surface = 'grass';
    run(asphalt, c, 1);
    expect(asphalt.forwardSpeed).toBeLessThan(v - 5);
  });

  it('es determinista', () => {
    const a = fresh();
    const b = fresh();
    const c = createControls();
    for (let i = 0; i < 600; i++) {
      c.throttle = i % 7 < 5 ? 1 : 0;
      c.steer = Math.sin(i * 0.05);
      c.handbrake = i % 50 > 45;
      stepCar(a, P, c, STEP_SECONDS);
      stepCar(b, P, c, STEP_SECONDS);
    }
    expect(a).toEqual(b);
  });
});

describe('borde de la pista', () => {
  const def = TRACKS[0];
  if (!def) throw new Error('sin circuitos');
  const track = new Track(def);
  const query = createTrackQuery();

  /** Coche junto al muro izquierdo en la muestra 40, apuntando hacia él con un ángulo dado. */
  function towardWall(angle: number, speed: number): CarState {
    const car = createCarState();
    track.query(track.x(40), track.z(40), query);
    const h = Math.atan2(-query.tangentZ, query.tangentX);
    const lateral = track.wallDistance - P.collisionRadius - 0.5;
    placeCar(
      car,
      track.x(40) + query.tangentZ * lateral,
      track.z(40) - query.tangentX * lateral,
      h + angle,
    );
    car.vx = Math.cos(car.heading) * speed;
    car.vz = -Math.sin(car.heading) * speed;
    return car;
  }

  function simulate(
    car: CarState,
    controls: CarControls,
    seconds: number,
    onStep?: () => void,
  ): void {
    const steps = Math.round(seconds / STEP_SECONDS);
    for (let i = 0; i < steps; i++) {
      stepCar(car, P, controls, STEP_SECONDS);
      resolveTrackContact(car, P, track, query, STEP_SECONDS);
      onStep?.();
    }
  }

  it('no deja atravesar el muro', () => {
    const car = towardWall(0.5, 35);
    const c = createControls();
    c.throttle = 1;
    let maxLateral = 0;
    simulate(car, c, 2, () => (maxLateral = Math.max(maxLateral, Math.abs(query.lateral))));
    expect(maxLateral).toBeLessThanOrEqual(track.wallDistance - P.collisionRadius + 1e-6);
  });

  it('un roce lateral frena sin detener en seco', () => {
    const car = towardWall(0.15, 35);
    const c = createControls();
    c.throttle = 1;
    // Velocidad justo antes y justo después del primer golpe (el coche parte sobre el césped,
    // así que se compara solo el efecto del muro).
    let before = 0;
    let after = 0;
    simulate(car, c, 0.5, () => {
      if (after === 0 && car.wallImpact > 0) after = speedOf(car);
      else if (after === 0) before = speedOf(car);
    });
    expect(after).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before * 0.85);
    expect(speedOf(car)).toBeGreaterThan(15);
  });

  it('tras un golpe frontal se puede salir acelerando y girando', () => {
    const car = towardWall(1.2, 25);
    const c = createControls();
    c.throttle = 1;
    simulate(car, c, 1.5);
    // Gira hacia el centro de la pista (a la derecha) y acelera.
    c.steer = -1;
    simulate(car, c, 0.8);
    c.steer = 0;
    simulate(car, c, 1);
    expect(speedOf(car)).toBeGreaterThan(10);
    // Se ha separado del muro izquierdo sin llegar al derecho.
    expect(query.lateral).toBeLessThan(track.wallDistance - P.collisionRadius - 2);
    expect(query.lateral).toBeGreaterThan(-(track.wallDistance - P.collisionRadius));
  });
});
