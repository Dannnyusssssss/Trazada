import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../src/data/balance';
import { TRACKS } from '../src/data/tracks';
import { FOOTPRINT, placeScenery } from '../src/game/scenery';
import { baseTerrainHeight, terrainHeight } from '../src/game/terrain';
import { Track } from '../src/game/track';

describe('escenario', () => {
  for (const def of TRACKS) {
    const track = new Track(def);
    const items = placeScenery(track);

    it(`${def.name}: ningún objeto invade la zona circulable`, () => {
      expect(items.length).toBeGreaterThan(50);
      for (const item of items) {
        // Distancia real a la línea central (búsqueda completa, sin la rejilla).
        const i = track.nearestIndexBruteForce(item.x, item.z);
        const d = Math.hypot(item.x - track.x(i), item.z - track.z(i));
        const footprint = item.kind === 'lamp' ? 0 : FOOTPRINT[item.kind] * item.scale;
        expect(d).toBeGreaterThanOrEqual(track.wallDistance + 1 + footprint);
        expect(Number.isFinite(item.y)).toBe(true);
      }
    });

    it(`${def.name}: la colocación es determinista`, () => {
      expect(placeScenery(track)).toEqual(items);
    });

    it(`${def.name}: coloca casi todo lo pedido`, () => {
      for (const rule of def.scenery) {
        const placed = items.filter((o) => o.kind === rule.kind).length;
        expect(placed).toBeGreaterThan(rule.count * 0.6);
      }
      if (def.lampSpacing > 0) expect(items.some((o) => o.kind === 'lamp')).toBe(true);
    });
  }
});

describe('terreno', () => {
  for (const def of TRACKS) {
    it(`${def.name}: el terreno lejano queda por debajo de toda la pista`, () => {
      const track = new Track(def);
      const base = baseTerrainHeight(track);
      for (let i = 0; i < track.sampleCount; i++) {
        for (const lateral of [-track.wallDistance, 0, track.wallDistance]) {
          expect(base).toBeLessThan(track.heightAt(i, lateral) - TERRAIN.belowTrack);
        }
      }
    });
  }

  for (const def of TRACKS) {
    it(`${def.name}: bajo la pista queda por debajo de la superficie`, () => {
      const track = new Track(def);
      for (let i = 0; i < track.sampleCount; i += 37) {
        const tx = track.tx[i] ?? 1;
        const tz = track.tz[i] ?? 0;
        for (const lateral of [-track.wallDistance, -2, 0, 3, track.wallDistance]) {
          const x = track.x(i) + tz * lateral;
          const z = track.z(i) - tx * lateral;
          const h = terrainHeight(track, x, z);
          expect(h).toBeLessThan(track.heightAt(i, lateral) - TERRAIN.belowTrack * 0.5);
        }
      }
    });
  }
});
