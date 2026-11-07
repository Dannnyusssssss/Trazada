import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/data/balance';
import { SAVE_KEY } from '../src/data/meta';
import {
  SaveStore,
  defaultSave,
  parseSave,
  serializeSave,
  type StorageLike,
} from '../src/save/storage';

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

class FullStorage extends MemoryStorage {
  override setItem(): void {
    throw new DOMException('Cuota llena', 'QuotaExceededError');
  }
}

class BlockedStorage implements StorageLike {
  getItem(): string | null {
    throw new DOMException('Bloqueado', 'SecurityError');
  }
  setItem(): void {
    throw new DOMException('Bloqueado', 'SecurityError');
  }
}

const defaults = defaultSave(false);

describe('parseSave', () => {
  it('sin datos usa los valores por defecto', () => {
    expect(parseSave(null, defaults)).toEqual(defaults);
    expect(parseSave('', defaults)).toEqual(defaults);
  });

  it('respeta prefers-reduced-motion en los valores por defecto', () => {
    expect(parseSave(null, defaultSave(true)).settings.reducedMotion).toBe(true);
  });

  it('JSON corrupto no rompe nada', () => {
    expect(parseSave('{"version":1,"settings":', defaults)).toEqual(defaults);
    expect(parseSave('null', defaults)).toEqual(defaults);
    expect(parseSave('[1,2,3]', defaults)).toEqual(defaults);
  });

  it('versión desconocida o ausente se ignora', () => {
    const raw = JSON.stringify({ version: 99, settings: { muted: true } });
    expect(parseSave(raw, defaults)).toEqual(defaults);
    expect(parseSave(JSON.stringify({ settings: { muted: true } }), defaults)).toEqual(defaults);
  });

  it('valida cada campo por separado', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { muted: 'sí', reducedMotion: true, fov: 1e9 },
      bestLaps: {
        'valle-solar': { gorrion: 61_234, zorro: Number.NaN, 'MAL ID': 50_000, vencejo: -5 },
        'otro-circuito': 'no es un objeto',
        'sin-validos': { gorrion: 1 },
      },
    });
    const save = parseSave(raw, defaults);
    expect(save.settings.muted).toBe(false);
    expect(save.settings.reducedMotion).toBe(true);
    expect(save.settings.fov).toBe(CAMERA.fovDefault);
    expect(save.bestLaps).toEqual({ 'valle-solar': { gorrion: 61_234 } });
  });

  it('ignora la clave __proto__', () => {
    const raw = '{"version":1,"bestLaps":{"__proto__":{"gorrion":50000}}}';
    const save = parseSave(raw, defaults);
    expect(Object.keys(save.bestLaps)).toEqual([]);
    expect(Object.getPrototypeOf(save.bestLaps)).toBe(Object.prototype);
  });

  it('ignora números no finitos escritos como texto y datos enormes', () => {
    const raw = '{"version":1,"bestLaps":{"valle-solar":{"gorrion":1e999}}}';
    expect(parseSave(raw, defaults).bestLaps).toEqual({});
    expect(parseSave('x'.repeat(100_000), defaults)).toEqual(defaults);
  });

  it('ida y vuelta conserva los datos', () => {
    const data = defaultSave(true);
    data.settings.fov = 80;
    data.bestLaps = { 'valle-solar': { gorrion: 58_000 } };
    expect(parseSave(serializeSave(data), defaults)).toEqual(data);
  });
});

describe('compatibilidad', () => {
  it('un guardado del Hito 1 carga con los ajustes nuevos por defecto', () => {
    const old = JSON.stringify({
      version: 1,
      settings: { muted: true, reducedMotion: false, fov: 80 },
      bestLaps: { 'valle-solar': { gorrion: 58_000 } },
    });
    const save = parseSave(old, defaults);
    expect(save.settings).toEqual({ ...defaults.settings, muted: true, fov: 80 });
    expect(save.bestLaps).toEqual({ 'valle-solar': { gorrion: 58_000 } });
  });

  it('valida calidad, cámara y última selección', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { quality: 'ultra', camera: 'high', lastTrackId: 'cumbre', lastCarId: '<b>' },
    });
    const save = parseSave(raw, defaults);
    expect(save.settings.quality).toBe('medium');
    expect(save.settings.camera).toBe('high');
    expect(save.settings.lastTrackId).toBe('cumbre');
    expect(save.settings.lastCarId).toBe('gorrion');
  });
});

describe('SaveStore', () => {
  it('guarda récords solo si mejoran y los persiste con la clave del juego', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage, defaults);
    expect(store.recordLap('valle-solar', 'gorrion', 60_000)).toBe(true);
    expect(store.recordLap('valle-solar', 'gorrion', 61_000)).toBe(false);
    expect(store.recordLap('valle-solar', 'gorrion', 59_000)).toBe(true);
    expect([...storage.map.keys()]).toEqual([SAVE_KEY]);
    const reloaded = new SaveStore(storage, defaults);
    expect(reloaded.getBestLap('valle-solar', 'gorrion')).toBe(59_000);
  });

  it('rechaza tiempos inválidos', () => {
    const store = new SaveStore(new MemoryStorage(), defaults);
    expect(store.recordLap('valle-solar', 'gorrion', Number.NaN)).toBe(false);
    expect(store.recordLap('valle-solar', 'gorrion', 10)).toBe(false);
  });

  it('con la cuota llena sigue funcionando en memoria', () => {
    const store = new SaveStore(new FullStorage(), defaults);
    expect(store.save()).toBe(false);
    expect(store.recordLap('valle-solar', 'gorrion', 60_000)).toBe(true);
    expect(store.getBestLap('valle-solar', 'gorrion')).toBe(60_000);
    store.updateSettings({ muted: true });
    expect(store.data.settings.muted).toBe(true);
  });

  it('con el almacenamiento bloqueado o ausente usa los valores por defecto', () => {
    expect(new SaveStore(new BlockedStorage(), defaults).data).toEqual(defaults);
    const none = new SaveStore(null, defaults);
    expect(none.data).toEqual(defaults);
    expect(none.save()).toBe(false);
  });

  it('actualiza ajustes y los persiste', () => {
    const storage = new MemoryStorage();
    new SaveStore(storage, defaults).updateSettings({ reducedMotion: true, fov: 75 });
    const reloaded = new SaveStore(storage, defaults);
    expect(reloaded.data.settings).toMatchObject({ muted: false, reducedMotion: true, fov: 75 });
  });
});

describe('guardado del Hito 3 (modo, dificultad, sonido, ayudas y puestos)', () => {
  it('un guardado del Hito 2 carga con los valores nuevos por defecto', () => {
    const old = JSON.stringify({
      version: 1,
      settings: {
        muted: true,
        reducedMotion: false,
        fov: 70,
        quality: 'high',
        camera: 'chase',
        lastTrackId: 'cumbre',
        lastCarId: 'zorro',
      },
      bestLaps: { cumbre: { zorro: 70_000 } },
    });
    const data = parseSave(old, defaults);
    expect(data.settings.muted).toBe(true);
    expect(data.settings.quality).toBe('high');
    expect(data.settings.mode).toBe('timeTrial');
    expect(data.settings.difficulty).toBe('normal');
    expect(data.settings.volume).toBe(defaults.settings.volume);
    expect(data.settings.music).toBe(true);
    expect(data.settings.assists).toEqual(defaults.settings.assists);
    expect(data.raceBest).toEqual({});
    expect(data.bestLaps).toEqual({ cumbre: { zorro: 70_000 } });
  });

  it('valida cada campo nuevo y descarta lo que no es válido', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: {
        mode: 'online',
        difficulty: 'imposible',
        volume: 250,
        music: 'sí',
        assists: { steering: true, braking: 'no', autoRespawn: false, extra: true },
      },
      raceBest: {
        'valle-solar': { easy: 1, normal: 0, hard: 2.5 },
        cumbre: { normal: 9 },
        __proto__: { easy: 1 },
        'Mal Id': { easy: 1 },
      },
    });
    const data = parseSave(raw, defaults);
    expect(data.settings.mode).toBe('timeTrial');
    expect(data.settings.difficulty).toBe('normal');
    expect(data.settings.volume).toBe(defaults.settings.volume);
    expect(data.settings.music).toBe(true);
    expect(data.settings.assists).toEqual({ steering: true, braking: false, autoRespawn: false });
    expect(data.raceBest).toEqual({ 'valle-solar': { easy: 1 } });
  });

  it('acepta valores nuevos válidos', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { mode: 'race', difficulty: 'hard', volume: 35, music: false },
      raceBest: { 'puerto-neon': { hard: 3 } },
    });
    const data = parseSave(raw, defaults);
    expect(data.settings).toMatchObject({
      mode: 'race',
      difficulty: 'hard',
      volume: 35,
      music: false,
    });
    expect(data.raceBest).toEqual({ 'puerto-neon': { hard: 3 } });
  });

  it('guarda el mejor puesto solo si mejora y lo conserva al recargar', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(storage, defaults);
    expect(store.recordRacePosition('valle-solar', 'normal', 4)).toBe(true);
    expect(store.recordRacePosition('valle-solar', 'normal', 5)).toBe(false);
    expect(store.recordRacePosition('valle-solar', 'normal', 2)).toBe(true);
    expect(store.recordRacePosition('valle-solar', 'normal', 0)).toBe(false);
    expect(store.recordRacePosition('valle-solar', 'normal', 7)).toBe(false);
    const reloaded = new SaveStore(storage, defaults);
    expect(reloaded.getRaceBest('valle-solar', 'normal')).toBe(2);
    expect(reloaded.getRaceBest('valle-solar', 'hard')).toBeNull();
  });
});

describe('guardado del Hito 4 (resolución dinámica)', () => {
  it('un guardado del Hito 3 carga con la resolución dinámica activada y escala completa', () => {
    const old = JSON.stringify({ version: 1, settings: { quality: 'low', music: false } });
    const data = parseSave(old, defaults);
    expect(data.settings.quality).toBe('low');
    expect(data.settings.dynamicResolution).toBe(true);
    expect(data.settings.renderScale).toBe(1);
  });

  it('solo acepta escalas conocidas', () => {
    for (const renderScale of [0.85, 0.7, 0.6]) {
      const raw = JSON.stringify({
        version: 1,
        settings: { renderScale, dynamicResolution: false },
      });
      expect(parseSave(raw, defaults).settings).toMatchObject({
        renderScale,
        dynamicResolution: false,
      });
    }
    for (const renderScale of [0, 0.01, 2, -1, 'x', null, 1e300, 0.849]) {
      const raw = JSON.stringify({
        version: 1,
        settings: { renderScale, dynamicResolution: 'sí' },
      });
      expect(parseSave(raw, defaults).settings).toMatchObject({
        renderScale: 1,
        dynamicResolution: true,
      });
    }
  });

  it('con la cuota llena o el almacenamiento bloqueado el juego sigue con los ajustes en memoria', () => {
    for (const storage of [new FullStorage(), new BlockedStorage()]) {
      const store = new SaveStore(storage, defaults);
      expect(() => store.updateSettings({ renderScale: 0.7 })).not.toThrow();
      expect(store.save()).toBe(false);
      expect(store.data.settings.renderScale).toBe(0.7);
    }
  });
});
