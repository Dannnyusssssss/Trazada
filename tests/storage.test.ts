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
        'valle-solar': { gorrion: 61_234, zorro: Number.NaN, 'MAL ID': 50_000, condor: -5 },
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
    expect(reloaded.data.settings).toEqual({ muted: false, reducedMotion: true, fov: 75 });
  });
});
