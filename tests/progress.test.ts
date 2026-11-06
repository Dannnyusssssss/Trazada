import { describe, expect, it } from 'vitest';
import { TRACKS, VALLE_SOLAR } from '../src/data/tracks';
import { bestOnTrack, isTrackUnlocked, medalFor } from '../src/game/progress';

describe('medallas', () => {
  const m = VALLE_SOLAR.medals;

  it('asigna la medalla según los tiempos objetivo (límites incluidos)', () => {
    expect(medalFor(VALLE_SOLAR, m.gold)).toBe('gold');
    expect(medalFor(VALLE_SOLAR, m.gold + 1)).toBe('silver');
    expect(medalFor(VALLE_SOLAR, m.silver)).toBe('silver');
    expect(medalFor(VALLE_SOLAR, m.bronze)).toBe('bronze');
    expect(medalFor(VALLE_SOLAR, m.bronze + 1)).toBeNull();
    expect(medalFor(VALLE_SOLAR, null)).toBeNull();
    expect(medalFor(VALLE_SOLAR, Number.NaN)).toBeNull();
  });

  it('los tiempos de cada circuito son coherentes', () => {
    for (const def of TRACKS) {
      expect(def.medals.gold).toBeLessThan(def.medals.silver);
      expect(def.medals.silver).toBeLessThan(def.medals.bronze);
    }
  });
});

describe('desbloqueo', () => {
  it('el primer circuito está abierto y los demás piden el bronce del anterior', () => {
    expect(isTrackUnlocked(TRACKS, 0, {})).toBe(true);
    expect(isTrackUnlocked(TRACKS, 1, {})).toBe(false);
    const slow = { 'valle-solar': { gorrion: VALLE_SOLAR.medals.bronze + 5000 } };
    expect(isTrackUnlocked(TRACKS, 1, slow)).toBe(false);
    const bronze = { 'valle-solar': { gorrion: VALLE_SOLAR.medals.bronze } };
    expect(isTrackUnlocked(TRACKS, 1, bronze)).toBe(true);
    expect(isTrackUnlocked(TRACKS, 2, bronze)).toBe(false);
  });

  it('cuenta la mejor vuelta con cualquier coche', () => {
    const laps = { 'valle-solar': { gorrion: 90_000, zorro: 61_000 } };
    expect(bestOnTrack(laps, 'valle-solar')).toBe(61_000);
    expect(bestOnTrack(laps, 'cumbre')).toBeNull();
    expect(isTrackUnlocked(TRACKS, 1, laps)).toBe(true);
  });

  it('índices fuera de rango no están abiertos', () => {
    expect(isTrackUnlocked(TRACKS, TRACKS.length, { 'puerto-neon': { gorrion: 1 } })).toBe(false);
  });
});
