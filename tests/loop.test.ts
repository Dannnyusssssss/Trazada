import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from '../src/core/loop';

const STEP = 1 / 60;

describe('FixedStepAccumulator', () => {
  it('produce los mismos pasos totales con frames regulares o irregulares', () => {
    const run = (frames: readonly number[]): number => {
      const acc = new FixedStepAccumulator(STEP, 5);
      let elapsed = 0;
      let steps = 0;
      let k = 0;
      while (elapsed < 2 - 1e-9) {
        const dt = Math.min(frames[k++ % frames.length] ?? STEP, 2 - elapsed);
        elapsed += dt;
        steps += acc.advance(dt);
      }
      return steps;
    };
    expect(run([1 / 60])).toBe(120);
    // Con frames irregulares puede quedar como mucho un paso a medias en el acumulador.
    expect(Math.abs(run([0.01, 0.03, 0.005, 0.02, 0.0166, 0.0434]) - 120)).toBeLessThanOrEqual(1);
    expect(Math.abs(run([1 / 144]) - 120)).toBeLessThanOrEqual(1);
  });

  it('respeta el tope de pasos por frame', () => {
    const acc = new FixedStepAccumulator(STEP, 5, 1);
    expect(acc.advance(0.5)).toBe(5);
    expect(acc.alpha).toBe(0);
  });

  it('limita frames muy largos (pestaña oculta)', () => {
    const acc = new FixedStepAccumulator(STEP, 100, 0.25);
    expect(acc.advance(10)).toBe(15);
  });

  it('alpha indica la fracción del siguiente paso', () => {
    const acc = new FixedStepAccumulator(STEP, 5);
    expect(acc.advance(STEP * 1.5)).toBe(1);
    expect(acc.alpha).toBeCloseTo(0.5);
  });

  it('ignora tiempos negativos o no finitos', () => {
    const acc = new FixedStepAccumulator(STEP, 5);
    expect(acc.advance(-1)).toBe(0);
    expect(acc.advance(Number.NaN)).toBe(0);
  });
});
