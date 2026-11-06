import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('repite la secuencia con la misma semilla', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('semillas distintas dan secuencias distintas', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('se mantiene en los rangos', () => {
    const r = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const n = r.int(3, 5);
      expect(n === 3 || n === 4 || n === 5).toBe(true);
      const f = r.range(-2, 2);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(2);
    }
  });
});
