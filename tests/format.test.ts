import { describe, expect, it } from 'vitest';
import { TEXTS } from '../src/data/texts';
import { formatDelta, formatLapTime, formatSpeed, medalName, statDots } from '../src/ui/format';

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

  it('la diferencia con el fantasma lleva siempre signo', () => {
    expect(formatDelta(420)).toBe('+0.42');
    expect(formatDelta(-1050)).toBe('−1.05');
    expect(formatDelta(0)).toBe('+0.00');
  });

  it('nombra las medallas', () => {
    expect(medalName('gold')).toBe(TEXTS.medals.gold);
    expect(medalName(null)).toBe(TEXTS.medals.none);
  });

  it('puntúa estadísticas de 2 a 5 puntos', () => {
    expect(statDots(1, 1, 3)).toBe('●●○○○');
    expect(statDots(3, 1, 3)).toBe('●●●●●');
    expect(statDots(2, 1, 3).length).toBe(5);
    expect(statDots(5, 5, 5)).toBe('●●●○○');
  });
});
