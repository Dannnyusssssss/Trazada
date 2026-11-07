import { describe, expect, it } from 'vitest';
import { DynamicResolution } from '../src/core/dynamic-resolution';
import { DYNAMIC_RESOLUTION } from '../src/data/balance';

/** Simula `seconds` segundos de frames a `fps` y devuelve cuántas bajadas hubo. */
function run(dr: DynamicResolution, fps: number, seconds: number): number {
  let drops = 0;
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) if (dr.update(1 / fps)) drops++;
  return drops;
}

describe('resolución dinámica', () => {
  it('no baja con FPS altos', () => {
    const dr = new DynamicResolution(DYNAMIC_RESOLUTION);
    expect(run(dr, 60, 60)).toBe(0);
    expect(dr.scale).toBe(1);
  });

  it('baja un escalón tras unos segundos lentos seguidos', () => {
    const dr = new DynamicResolution(DYNAMIC_RESOLUTION);
    const c = DYNAMIC_RESOLUTION;
    // Antes de estabilizarse + el tiempo sostenido no cambia nada.
    expect(run(dr, 40, c.settleSeconds + c.sustainSeconds - 0.6)).toBe(0);
    expect(run(dr, 40, 1)).toBe(1);
    expect(dr.scale).toBe(c.scales[1]);
  });

  it('una ventana rápida corta la racha lenta', () => {
    const dr = new DynamicResolution(DYNAMIC_RESOLUTION);
    for (let i = 0; i < 20; i++) {
      run(dr, 40, 2);
      run(dr, 60, 1);
    }
    expect(dr.scale).toBe(1);
  });

  it('ignora los tirones aislados (frames muy largos)', () => {
    const dr = new DynamicResolution(DYNAMIC_RESOLUTION);
    for (let i = 0; i < 100; i++) {
      run(dr, 60, 0.5);
      dr.update(1);
    }
    expect(dr.scale).toBe(1);
  });

  it('no baja del último escalón', () => {
    const dr = new DynamicResolution(DYNAMIC_RESOLUTION);
    run(dr, 20, 120);
    const scales = DYNAMIC_RESOLUTION.scales;
    expect(dr.scale).toBe(scales[scales.length - 1]);
    expect(run(dr, 20, 30)).toBe(0);
  });

  it('empieza en el escalón guardado más cercano y tolera valores raros', () => {
    expect(new DynamicResolution(DYNAMIC_RESOLUTION, 0.7).scale).toBe(0.7);
    expect(new DynamicResolution(DYNAMIC_RESOLUTION, 0.72).scale).toBe(0.7);
    expect(new DynamicResolution(DYNAMIC_RESOLUTION, Number.NaN).scale).toBe(1);
    expect(new DynamicResolution(DYNAMIC_RESOLUTION, 5).scale).toBe(1);
  });

  it('ignora duraciones no válidas', () => {
    const dr = new DynamicResolution(DYNAMIC_RESOLUTION);
    for (let i = 0; i < 1000; i++) {
      expect(dr.update(Number.NaN)).toBe(false);
      expect(dr.update(-1)).toBe(false);
      expect(dr.update(0)).toBe(false);
    }
    expect(dr.scale).toBe(1);
  });
});
