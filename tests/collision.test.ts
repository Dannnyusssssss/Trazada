import { describe, expect, it } from 'vitest';
import { CAR_COLLISION } from '../src/data/balance';
import { createCarState, placeCar, type CarState } from '../src/game/car';
import { carsOverlap, collideCars } from '../src/game/collision';

function carAt(x: number, z: number, heading: number, vx = 0, vz = 0): CarState {
  const car = createCarState();
  placeCar(car, x, z, heading);
  car.vx = vx;
  car.vz = vz;
  return car;
}

describe('colisión entre coches', () => {
  it('dos coches separados no se tocan', () => {
    const a = carAt(0, 0, 0);
    const b = carAt(0, 10, 0);
    expect(carsOverlap(a, 1, b, 1)).toBe(false);
    expect(collideCars(a, 1, b, 1)).toBe(0);
    expect(a.x).toBe(0);
    expect(b.z).toBe(10);
  });

  it('separa a los dos coches a partes iguales hasta dejar de solaparse', () => {
    // Dos coches en paralelo (rumbo 0 = hacia +x), solapados de lado.
    const a = carAt(0, 0, 0);
    const b = carAt(0, 1.2, 0);
    expect(carsOverlap(a, 1, b, 1)).toBe(true);
    collideCars(a, 1, b, 1);
    expect(a.z).toBeCloseTo(-(b.z - 1.2), 6);
    expect(carsOverlap(a, 1, b, 1)).toBe(false);
  });

  it('conserva la cantidad de movimiento y devuelve la velocidad de cierre', () => {
    // a va hacia b por detrás (alcance).
    const a = carAt(0, 0, 0, 20, 0);
    const b = carAt(3.5, 0, 0, 10, 0);
    const before = a.vx + b.vx;
    const impact = collideCars(a, 1, b, 1);
    expect(impact).toBeCloseTo(10, 6);
    expect(a.vx + b.vx).toBeCloseTo(before, 6);
    // Tras el empujón se alejan (o al menos dejan de acercarse), con poco rebote.
    expect(b.vx).toBeGreaterThanOrEqual(a.vx);
    expect(b.vx - a.vx).toBeCloseTo(10 * CAR_COLLISION.restitution, 6);
    // La velocidad de avance se recalcula.
    expect(a.forwardSpeed).toBeCloseTo(a.vx, 6);
  });

  it('si ya se alejan, solo los separa sin impulso', () => {
    const a = carAt(0, 0, 0, 5, 0);
    const b = carAt(3.5, 0, 0, 15, 0);
    expect(collideCars(a, 1, b, 1)).toBe(0);
    expect(a.vx).toBe(5);
    expect(b.vx).toBe(15);
  });

  it('un coche no se mete por detrás de otro (dos círculos por coche)', () => {
    // Con un solo círculo de radio 1 cabrían a 2 m; con morro y cola chocan a 3,5 m de centro a centro.
    const a = carAt(0, 0, 0);
    const b = carAt(3.5, 0, 0);
    expect(carsOverlap(a, 1, b, 1)).toBe(true);
  });

  it('coches en el mismo punto se separan sin dar NaN', () => {
    const a = carAt(0, 0, 0);
    const b = carAt(0, 0, 0);
    collideCars(a, 1, b, 1);
    for (const v of [a.x, a.z, b.x, b.z]) expect(Number.isFinite(v)).toBe(true);
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeGreaterThan(0);
  });
});
