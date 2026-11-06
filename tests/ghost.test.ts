import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { SIM } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { CUMBRE, VALLE_SOLAR } from '../src/data/tracks';
import {
  GHOST_MAX_SAMPLES,
  GhostPlayer,
  expectedSamples,
  sampleCount,
  validateGhost,
  type GhostData,
} from '../src/game/ghost';
import { Track } from '../src/game/track';
import { World } from '../src/game/world';
import { GhostStore, ghostKey, parseGhost, serializeGhost } from '../src/save/ghost-storage';
import type { StorageLike } from '../src/save/storage';
import { autopilot } from './helpers/autopilot';

const track = new Track(VALLE_SOLAR);

/** Conduce con el piloto automático hasta completar `laps` vueltas y guarda la trayectoria de la 2.ª vuelta. */
function driveLaps(laps: number): {
  world: World;
  ghosts: GhostData[];
  path: { x: number; z: number }[];
} {
  const world = new World(track, GORRION, null);
  const controls = createControls();
  const ghosts: GhostData[] = [];
  const path: { x: number; z: number }[] = [];
  let seen = 0;
  for (let s = 0; s < SIM.hz * 400 && world.race.lapsCompleted < laps; s++) {
    autopilot(world, controls);
    world.step({ controls, respawn: false });
    if (world.race.lapsCompleted === 1 && !world.lapCompletedThisStep) {
      path[world.race.lapSteps] = { x: world.car.x, z: world.car.z };
    }
    if (world.ghostVersion !== seen && world.lastGhost) {
      seen = world.ghostVersion;
      ghosts.push(world.lastGhost);
    }
  }
  return { world, ghosts, path };
}

const run = driveLaps(2);

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('grabación del fantasma', () => {
  it('graba una vuelta por cada vuelta completada, a 20 Hz', () => {
    expect(run.ghosts.length).toBe(2);
    for (const ghost of run.ghosts) {
      expect(ghost.trackId).toBe(VALLE_SOLAR.id);
      expect(ghost.carId).toBe(GORRION.id);
      expect(Math.abs(sampleCount(ghost) - expectedSamples(ghost.lapMs))).toBeLessThanOrEqual(2);
      expect(validateGhost(ghost, track)).toBe(true);
    }
  });

  it('la reproducción sigue la vuelta grabada sin desvío apreciable', () => {
    const ghost = run.ghosts[1];
    if (!ghost) throw new Error('sin fantasma');
    const player = new GhostPlayer(ghost, track);
    const pose = { x: 0, z: 0, heading: 0 };
    let maxError = 0;
    for (let step = 0; step < run.path.length; step++) {
      const real = run.path[step];
      if (!real || !player.poseAt(step, pose)) continue;
      maxError = Math.max(maxError, Math.hypot(pose.x - real.x, pose.z - real.z));
    }
    // Interpolación lineal entre muestras a 20 Hz: error de unos pocos centímetros.
    expect(maxError).toBeLessThan(0.15);
  });

  it('el tiempo por distancia del fantasma cuadra con su vuelta', () => {
    const ghost = run.ghosts[1];
    if (!ghost) throw new Error('sin fantasma');
    const player = new GhostPlayer(ghost, track);
    const half = player.timeAtDistance(track.length / 2);
    expect(half).not.toBeNull();
    expect(half ?? 0).toBeGreaterThan(ghost.lapMs * 0.3);
    expect(half ?? 0).toBeLessThan(ghost.lapMs * 0.7);
    expect(player.timeAtDistance(-50)).toBeNull();
    expect(player.timeAtDistance(track.length + 50)).toBeNull();
    // A más distancia, más tiempo.
    expect(player.timeAtDistance(800) ?? 0).toBeGreaterThan(player.timeAtDistance(400) ?? 0);
  });

  it('la reproducción termina al acabar la vuelta grabada', () => {
    const ghost = run.ghosts[0];
    if (!ghost) throw new Error('sin fantasma');
    const player = new GhostPlayer(ghost, track);
    const pose = { x: 0, z: 0, heading: 0 };
    expect(player.poseAt(0, pose)).toBe(true);
    expect(player.poseAt(sampleCount(ghost) * 3 + 10, pose)).toBe(false);
  });
});

describe('validación del fantasma', () => {
  const ghost = run.ghosts[0];
  if (!ghost) throw new Error('sin fantasma');

  it('rechaza un fantasma de otro circuito o con posiciones fuera de la pista', () => {
    expect(validateGhost(ghost, new Track(CUMBRE))).toBe(false);
    const moved = { ...ghost, samples: ghost.samples.slice() };
    moved.samples[30] = 99_999_999;
    expect(validateGhost(moved, track)).toBe(false);
  });

  it('rechaza un número de muestras que no cuadra con el tiempo', () => {
    expect(validateGhost({ ...ghost, lapMs: ghost.lapMs * 2 }, track)).toBe(false);
  });
});

describe('guardado del fantasma', () => {
  const ghost = run.ghosts[0];
  if (!ghost) throw new Error('sin fantasma');

  it('ida y vuelta exacta con la clave del circuito', () => {
    const storage = new MemoryStorage();
    const store = new GhostStore(storage);
    expect(store.save(ghost)).toBe(true);
    expect([...storage.map.keys()]).toEqual([ghostKey(VALLE_SOLAR.id)]);
    expect(ghostKey(VALLE_SOLAR.id)).toBe('trazada:ghost:valle-solar:v1');
    const loaded = store.load(VALLE_SOLAR.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.lapMs).toBe(ghost.lapMs);
    expect(Array.from(loaded?.samples ?? [])).toEqual(Array.from(ghost.samples));
  });

  it('el tamaño queda acotado', () => {
    // Una vuelta de un minuto ocupa unos 20 KB.
    expect(serializeGhost(ghost).length).toBeLessThan(40_000);
  });

  it('ignora datos corruptos o manipulados', () => {
    const good = JSON.parse(serializeGhost(ghost)) as Record<string, unknown>;
    const variants: unknown[] = [
      'no es json',
      '[]',
      { ...good, version: 2 },
      { ...good, trackId: 'cumbre' },
      { ...good, hz: 60 },
      { ...good, carId: 'MAL ID' },
      { ...good, lapMs: Number.MAX_VALUE },
      { ...good, lapMs: 'rápido' },
      { ...good, lapMs: (good.lapMs as number) * 3 },
      { ...good, samples: '***' },
      { ...good, samples: btoa('abc') },
    ];
    for (const v of variants) {
      const raw = typeof v === 'string' ? v : JSON.stringify(v);
      expect(parseGhost(raw, VALLE_SOLAR.id)).toBeNull();
    }
    expect(parseGhost('x'.repeat(GHOST_MAX_SAMPLES * 20), VALLE_SOLAR.id)).toBeNull();
  });

  it('con la cuota llena no rompe nada', () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Cuota llena', 'QuotaExceededError');
      },
    };
    const store = new GhostStore(full);
    expect(store.save(ghost)).toBe(false);
    expect(store.load(VALLE_SOLAR.id)).toBeNull();
    expect(new GhostStore(null).save(ghost)).toBe(false);
  });
});
