import { describe, expect, it } from 'vitest';
import { AI, RACING_LINE } from '../src/data/balance';
import { CARS, GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import {
  centerlineProfile,
  estimateLapSeconds,
  lateralAccelForLapTime,
  racingLineFor,
  speedProfile,
} from '../src/game/racing-line';
import { Track } from '../src/game/track';

describe('línea de carrera', () => {
  for (const def of TRACKS) {
    const track = new Track(def);
    const line = racingLineFor(track);

    it(`${def.name}: queda dentro del asfalto con margen`, () => {
      const limit = track.halfWidth - AI.lineMargin + 1e-9;
      for (let i = 0; i < track.sampleCount; i++) {
        expect(Math.abs(line.offset[i] ?? 0)).toBeLessThanOrEqual(limit);
      }
      expect(line.offsetAt(0)).toBeCloseTo(line.offset[0] ?? 0, 6);
    });

    it(`${def.name}: es más rápida que la línea central para el mismo coche`, () => {
      const p = GORRION.params;
      const onLine = estimateLapSeconds(speedProfile(line, p, 11, 18), line.segment, p);
      const segment = new Float64Array(track.sampleCount).fill(track.spacing);
      const center = estimateLapSeconds(centerlineProfile(track, p, 11, 18), segment, p);
      expect(onLine).toBeLessThan(center);
    });

    it(`${def.name}: el perfil de velocidad respeta el coche y la frenada`, () => {
      for (const car of CARS) {
        const brake = car.params.brakeDecel * 0.7;
        const v = speedProfile(line, car.params, 11, brake);
        const n = v.length;
        for (let i = 0; i < n; i++) {
          const here = v[i] ?? 0;
          expect(here).toBeLessThanOrEqual(car.params.maxSpeed + 1e-9);
          expect(here).toBeGreaterThan(0);
          // Desde cada punto se puede frenar hasta la velocidad del siguiente.
          const next = v[(i + 1) % n] ?? 0;
          const ds = line.segment[i] ?? 0;
          expect(here * here).toBeLessThanOrEqual(next * next + 2 * brake * ds + 1e-6);
        }
      }
    });

    it(`${def.name}: más aceleración lateral da una vuelta estimada más corta`, () => {
      const p = GORRION.params;
      const slow = estimateLapSeconds(speedProfile(line, p, 8, 18), line.segment, p);
      const fast = estimateLapSeconds(speedProfile(line, p, 14, 18), line.segment, p);
      expect(fast).toBeLessThan(slow);
    });

    it(`${def.name}: encuentra la aceleración lateral para un ritmo dado`, () => {
      const p = GORRION.params;
      const target = def.medals.silver / 1000;
      const a = lateralAccelForLapTime(line, p, 18, target);
      expect(a).toBeGreaterThan(RACING_LINE.minLateralAccel);
      expect(a).toBeLessThan(RACING_LINE.maxLateralAccel);
      const seconds = estimateLapSeconds(speedProfile(line, p, a, 18), line.segment, p);
      expect(Math.abs(seconds - target) / target).toBeLessThan(0.01);
    });

    it(`${def.name}: el perfil prudente de la línea central es más lento en curva`, () => {
      const profile = centerlineProfile(track, GORRION.params, 12, 18);
      expect(profile.length).toBe(track.sampleCount);
      expect(Math.min(...profile)).toBeLessThan(GORRION.params.maxSpeed);
    });
  }

  it('se calcula una sola vez por circuito', () => {
    const def = TRACKS[0];
    if (!def) throw new Error('sin circuitos');
    const track = new Track(def);
    expect(racingLineFor(track)).toBe(racingLineFor(track));
  });
});
