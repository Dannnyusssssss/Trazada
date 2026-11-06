import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { vec2 } from '../src/core/math';
import { TRACK } from '../src/data/balance';
import { TRACKS, type TrackDef } from '../src/data/tracks';
import { Track, createTrackQuery, progressDelta, validateTrack } from '../src/game/track';

/** Circuito circular de radio 100 m (sentido antihorario visto desde arriba = giro a la izquierda). */
function circleDef(radius = 100): TrackDef {
  const base = TRACKS[0];
  if (!base) throw new Error('sin circuitos');
  const points: [number, number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    // Con rumbo (cos h, -sin h), recorrer (cos a, -sin a) gira siempre a la izquierda.
    points.push([Math.cos(a) * radius, -Math.sin(a) * radius, 0]);
  }
  return { ...base, id: 'circulo', name: 'Círculo', points, checkpointCount: 6 };
}

describe('datos de circuitos', () => {
  for (const def of TRACKS) {
    it(`${def.name} es válido`, () => {
      const track = new Track(def);
      expect(validateTrack(track)).toEqual([]);
      expect(track.length).toBeGreaterThan(800);
      expect(track.spacing).toBeCloseTo(TRACK.sampleSpacing, 1);
    });
  }

  it('ids únicos', () => {
    const ids = TRACKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('detecta una pista que se cruza consigo misma', () => {
    const base = TRACKS[0];
    if (!base) throw new Error('sin circuitos');
    // Un "ocho": los tramos se cruzan en el centro.
    const eight: TrackDef = {
      ...base,
      points: [
        [0, 0, 0],
        [150, 120, 0],
        [300, 0, 0],
        [150, -120, 0],
        [0, 0.5, 0],
        [-150, 120, 0],
        [-300, 0, 0],
        [-150, -120, 0],
      ],
    };
    expect(validateTrack(new Track(eight)).length).toBeGreaterThan(0);
  });

  it('detecta ancho insuficiente y pocos checkpoints', () => {
    const base = TRACKS[0];
    if (!base) throw new Error('sin circuitos');
    const errors = validateTrack(new Track({ ...base, width: 4, checkpointCount: 1 }));
    expect(errors).toContain('ancho menor que el mínimo');
    expect(errors).toContain('pocos checkpoints');
  });
});

describe('geometría de la pista', () => {
  const track = new Track(circleDef());

  it('la longitud de un círculo es 2·PI·r', () => {
    expect(track.length).toBeCloseTo(2 * Math.PI * 100, -0.5);
  });

  it('la curvatura de un círculo a izquierdas es +1/r', () => {
    for (let i = 0; i < track.sampleCount; i += 50) {
      expect(track.curvature[i]).toBeCloseTo(1 / 100, 2);
    }
  });

  it('los checkpoints están repartidos a intervalos iguales y el 0 es la meta', () => {
    expect(track.checkpointProgress[0]).toBe(0);
    expect(track.checkpointProgress[3]).toBeCloseTo(track.length / 2);
  });

  it('pointAt devuelve un punto sobre la línea central', () => {
    const p = vec2();
    const t = vec2();
    track.pointAt(track.length / 4, p, t);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(100, 0);
    expect(Math.hypot(t.x, t.z)).toBeCloseTo(1);
  });
});

describe('consulta de punto más cercano', () => {
  const def = TRACKS[0];
  if (!def) throw new Error('sin circuitos');
  const track = new Track(def);

  it('coincide con la búsqueda completa en puntos de la zona circulable', () => {
    const rng = new Rng(7);
    const p = vec2();
    const t = vec2();
    for (let k = 0; k < 2000; k++) {
      track.pointAt(rng.range(0, track.length), p, t);
      const lateral = rng.range(-track.wallDistance, track.wallDistance);
      // Normal izquierda de la tangente: (z, -x).
      const x = p.x + t.z * lateral;
      const z = p.z - t.x * lateral;
      const fast = track.nearestIndex(x, z);
      const slow = track.nearestIndexBruteForce(x, z);
      const df = Math.hypot(track.x(fast) - x, track.z(fast) - z);
      const dsl = Math.hypot(track.x(slow) - x, track.z(slow) - z);
      expect(df).toBeCloseTo(dsl, 6);
    }
  });

  it('funciona también lejos de la pista (búsqueda completa de respaldo)', () => {
    const i = track.nearestIndex(5000, 5000);
    expect(i).toBe(track.nearestIndexBruteForce(5000, 5000));
  });

  it('calcula progreso y distancia lateral con signo', () => {
    const q = createTrackQuery();
    const p = vec2();
    const t = vec2();
    track.pointAt(300, p, t);
    track.query(p.x + t.z * 3, p.z - t.x * 3, q);
    expect(q.progress).toBeCloseTo(300, 0);
    expect(q.lateral).toBeCloseTo(3, 1);
    track.query(p.x - t.z * 5, p.z + t.x * 5, q);
    expect(q.lateral).toBeCloseTo(-5, 1);
  });

  it('clasifica la superficie según la distancia lateral', () => {
    const curbIndex = track.curbed.indexOf(1);
    const straightIndex = track.curbed.indexOf(0);
    expect(curbIndex).toBeGreaterThanOrEqual(0);
    expect(straightIndex).toBeGreaterThanOrEqual(0);
    const hw = track.halfWidth;
    expect(track.surfaceAt(straightIndex, 0)).toBe('asphalt');
    expect(track.surfaceAt(straightIndex, hw - 0.1)).toBe('asphalt');
    expect(track.surfaceAt(curbIndex, hw - 0.1)).toBe('curb');
    expect(track.surfaceAt(curbIndex, -(hw - 0.1))).toBe('curb');
    expect(track.surfaceAt(curbIndex, hw - TRACK.curbWidth - 0.1)).toBe('asphalt');
    expect(track.surfaceAt(straightIndex, hw + 0.1)).toBe('grass');
  });
});

describe('progressDelta', () => {
  it('da el camino más corto con signo a través de la meta', () => {
    expect(progressDelta(990, 10, 1000)).toBeCloseTo(20);
    expect(progressDelta(10, 990, 1000)).toBeCloseTo(-20);
    expect(progressDelta(100, 150, 1000)).toBeCloseTo(50);
  });
});
