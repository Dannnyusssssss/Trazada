import { describe, expect, it } from 'vitest';
import { busGain } from '../src/audio/volume';

describe('volumen por bus', () => {
  it('escala el nivel base con el volumen', () => {
    expect(busGain(0.5, 100)).toBe(0.5);
    expect(busGain(0.5, 50)).toBe(0.25);
    expect(busGain(0.5, 0)).toBe(0);
  });

  it('recorta el volumen a 0–100 y nunca da ganancias negativas', () => {
    expect(busGain(0.5, 250)).toBe(0.5);
    expect(busGain(0.5, -20)).toBe(0);
    expect(busGain(-1, 80)).toBe(0);
  });

  it('trata los valores no finitos como silencio', () => {
    expect(busGain(0.5, Number.NaN)).toBe(0);
    expect(busGain(Number.POSITIVE_INFINITY, 50)).toBe(0);
  });
});
