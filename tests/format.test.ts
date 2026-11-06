import { describe, expect, it } from 'vitest';
import { TEXTS } from '../src/data/texts';
import { formatLapTime, formatSpeed } from '../src/ui/format';

describe('formato', () => {
  it('formatea tiempos de vuelta', () => {
    expect(formatLapTime(0)).toBe('0:00.000');
    expect(formatLapTime(61_234)).toBe('1:01.234');
    expect(formatLapTime(59_999.9)).toBe('0:59.999');
    expect(formatLapTime(null)).toBe(TEXTS.hud.emptyTime);
    expect(formatLapTime(Number.NaN)).toBe(TEXTS.hud.emptyTime);
  });

  it('formatea la velocidad en km/h', () => {
    expect(formatSpeed(10)).toBe('36');
    expect(formatSpeed(-10)).toBe('36');
  });
});
