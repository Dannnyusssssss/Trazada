import { describe, expect, it } from 'vitest';
import {
  ClosedCatmullRom,
  cross,
  dampFactor,
  forwardFromHeading,
  headingOf,
  leftFromHeading,
  lerpAngle,
  mod,
  moveToward,
  vec2,
  wrapAngle,
} from '../src/core/math';

describe('convenciones de rumbo', () => {
  it('la normal izquierda coincide con girar el rumbo a la izquierda', () => {
    const h = 0.7;
    const f = forwardFromHeading(vec2(), h);
    const left = leftFromHeading(vec2(), h);
    const fNext = forwardFromHeading(vec2(), h + 1e-4);
    // Aumentar el rumbo mueve la dirección hacia la normal izquierda.
    expect((fNext.x - f.x) * left.x + (fNext.z - f.z) * left.z).toBeGreaterThan(0);
    expect(left.x).toBeCloseTo(f.z);
    expect(left.z).toBeCloseTo(-f.x);
  });

  it('headingOf invierte forwardFromHeading', () => {
    for (const h of [-3, -1.2, 0, 0.5, 2.9]) {
      const f = forwardFromHeading(vec2(), h);
      expect(wrapAngle(headingOf(f.x, f.z) - h)).toBeCloseTo(0, 9);
    }
  });

  it('cross de una dirección con su normal izquierda vale -1', () => {
    const f = vec2(0, 1);
    const left = vec2(f.z, -f.x);
    expect(cross(f, left)).toBeCloseTo(-1);
  });
});

describe('utilidades', () => {
  it('wrapAngle deja el ángulo en (-PI, PI]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it('lerpAngle toma el camino corto', () => {
    expect(lerpAngle(3.0, -3.0, 0.5)).toBeCloseTo(Math.PI, 1);
  });

  it('moveToward no se pasa del objetivo', () => {
    expect(moveToward(0, 10, 3)).toBe(3);
    expect(moveToward(9, 10, 3)).toBe(10);
    expect(moveToward(0, -10, 3)).toBe(-3);
  });

  it('dampFactor converge igual con distintos frames', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) a += (1 - a) * dampFactor(5, 1 / 30);
    for (let i = 0; i < 144; i++) b += (1 - b) * dampFactor(5, 1 / 144);
    expect(a).toBeCloseTo(b, 9);
  });

  it('mod es siempre positivo', () => {
    expect(mod(-1, 5)).toBe(4);
    expect(mod(7, 5)).toBe(2);
  });
});

describe('ClosedCatmullRom', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('pasa por los puntos de control', () => {
    const s = new ClosedCatmullRom(square);
    const out = vec2();
    square.forEach(([x, z], i) => {
      s.evaluate(i, 0, out);
      expect(out.x).toBeCloseTo(x);
      expect(out.z).toBeCloseTo(z);
    });
  });

  it('es cerrada y continua entre segmentos', () => {
    const s = new ClosedCatmullRom(square);
    const a = vec2();
    const b = vec2();
    for (let i = 0; i < 4; i++) {
      s.evaluate(i, 1, a);
      s.evaluate(i + 1, 0, b);
      expect(a.x).toBeCloseTo(b.x);
      expect(a.z).toBeCloseTo(b.z);
    }
  });

  it('rechaza menos de 4 puntos', () => {
    expect(() => new ClosedCatmullRom(square.slice(0, 3))).toThrow();
  });
});
