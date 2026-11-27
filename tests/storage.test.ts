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

describe('ajustes táctiles (Hito 5)', () => {
  it('por defecto: aceleración automática, diestro, tamaño mediano y opacidad 60 %', () => {
    expect(defaults.settings.touch).toEqual({
      leftHanded: false,
      size: 'medium',
      opacity: 60,
      autoThrottle: true,
    });
  });

  it('en un dispositivo táctil la calidad inicial es Baja, pero una calidad guardada manda', () => {
    const touchDefaults = defaultSave(false, true);
    expect(touchDefaults.settings.quality).toBe('low');
    expect(parseSave(null, touchDefaults).settings.quality).toBe('low');
    const saved = JSON.stringify({ version: 1, settings: { quality: 'high' } });
    expect(parseSave(saved, touchDefaults).settings.quality).toBe('high');
    // Un guardado antiguo sin calidad también recibe la de por defecto del dispositivo.
    const old = JSON.stringify({ version: 1, settings: { muted: true } });
    expect(parseSave(old, touchDefaults).settings.quality).toBe('low');
  });

  it('un guardado antiguo sin ajustes táctiles recibe los valores por defecto', () => {
    const raw = JSON.stringify({ version: 1, settings: { muted: true, fov: 80 } });
    expect(parseSave(raw, defaults).settings.touch).toEqual(defaults.settings.touch);
  });

  it('lee los ajustes táctiles válidos y vuelven igual tras guardar', () => {
    const touch = { leftHanded: true, size: 'large', opacity: 90, autoThrottle: false };
    const raw = JSON.stringify({ version: 1, settings: { touch } });
    const save = parseSave(raw, defaults);
    expect(save.settings.touch).toEqual(touch);
    expect(parseSave(serializeSave(save), defaults).settings.touch).toEqual(touch);
  });

  it('descarta campo por campo los valores hostiles o corruptos', () => {
    const hostile: unknown[] = [
      { leftHanded: 'true', size: 'enorme', opacity: 1e9, autoThrottle: 1 },
      { leftHanded: null, size: '<img src=x onerror=alert(1)>', opacity: -5, autoThrottle: {} },
      { size: ['large'], opacity: Number.NaN },
      { opacity: '90' },
      { opacity: 39.9 },
      { opacity: 100.1 },
      { __proto__: { leftHanded: true }, constructor: 'x' },
    ];
    for (const touch of hostile) {
      const raw = JSON.stringify({ version: 1, settings: { touch } });
      expect(parseSave(raw, defaults).settings.touch).toEqual(defaults.settings.touch);
    }
    for (const touch of ['zurdo', 42, null, [true], true]) {
      const raw = JSON.stringify({ version: 1, settings: { touch } });
      expect(parseSave(raw, defaults).settings.touch).toEqual(defaults.settings.touch);
    }
  });

  it('mezcla: conserva lo válido y corrige solo lo inválido; la opacidad se redondea', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { touch: { leftHanded: true, size: 'gigante', opacity: 54.6, autoThrottle: 'no' } },
    });
    expect(parseSave(raw, defaults).settings.touch).toEqual({
      leftHanded: true,
      size: 'medium',
      opacity: 55,
      autoThrottle: true,
    });
  });

  it('no comparte el objeto táctil con los valores por defecto (cambiar uno no altera el otro)', () => {
    const save = parseSave(null, defaults);
    save.settings.touch.opacity = 100;
    expect(defaults.settings.touch.opacity).toBe(60);
  });
});

describe('volúmenes por bus y métricas (Hito 6)', () => {
  it('por defecto: música y efectos al 100 % y métricas ocultas', () => {
    expect(defaults.settings.musicVolume).toBe(100);
    expect(defaults.settings.sfxVolume).toBe(100);
    expect(defaults.settings.showMetrics).toBe(false);
  });

  it('un guardado del Hito 5 (sin los campos nuevos) carga con los valores por defecto', () => {
    const raw = JSON.stringify({ version: 1, settings: { volume: 40, music: false } });
    const save = parseSave(raw, defaults);
    expect(save.settings.volume).toBe(40);
    expect(save.settings.music).toBe(false);
    expect(save.settings.musicVolume).toBe(100);
    expect(save.settings.sfxVolume).toBe(100);
    expect(save.settings.showMetrics).toBe(false);
  });

  it('acepta valores válidos, redondea y sobrevive a la ida y vuelta', () => {
    const raw = JSON.stringify({
      version: 1,
      settings: { musicVolume: 35.4, sfxVolume: 0, showMetrics: true },
    });
    const save = parseSave(raw, defaults);
    expect(save.settings.musicVolume).toBe(35);
    expect(save.settings.sfxVolume).toBe(0);
    expect(save.settings.showMetrics).toBe(true);
    expect(parseSave(serializeSave(save), defaults).settings).toEqual(save.settings);
  });

  it('descarta valores fuera de rango o de otro tipo', () => {
    for (const bad of [-1, 101, 'alto', null, true, [50], { v: 50 }]) {
      const raw = JSON.stringify({ version: 1, settings: { musicVolume: bad, sfxVolume: bad } });
      const save = parseSave(raw, defaults);
      expect(save.settings.musicVolume).toBe(100);
      expect(save.settings.sfxVolume).toBe(100);
    }
    for (const bad of [1, 'true', null, [true], { on: true }]) {
      const raw = JSON.stringify({ version: 1, settings: { showMetrics: bad } });
      expect(parseSave(raw, defaults).settings.showMetrics).toBe(false);
    }
  });
});

describe('controles configurables (Hito 6)', () => {
  it('por defecto: teclas de fábrica, dirección directa, zona muerta 15 % y sensibilidad 100 %', () => {
    const controls = defaults.settings.controls;
    expect(controls.keys.throttle).toEqual(['KeyW', 'ArrowUp']);
    expect(controls.keyboardSteer).toBe('direct');
    expect(controls.padDeadzone).toBe(15);
    expect(controls.padSensitivity).toBe(100);
  });

  it('un guardado del Hito 5 (sin controles) carga con los de fábrica', () => {
    const raw = JSON.stringify({ version: 1, settings: { fov: 80 } });
    const save = parseSave(raw, defaults);
    expect(save.settings.fov).toBe(80);
    expect(save.settings.controls).toEqual(defaults.settings.controls);
  });

  it('guarda y recupera unas teclas cambiadas y los ajustes del stick', () => {
    const keys = {
      ...defaults.settings.controls.keys,
      throttle: ['KeyI', null],
      mute: ['KeyN', null],
    };
    const controls = { keys, keyboardSteer: 'smooth', padDeadzone: 22, padSensitivity: 130 };
    const raw = JSON.stringify({ version: 1, settings: { controls } });
    const save = parseSave(raw, defaults);
    expect(save.settings.controls).toEqual(controls);
    expect(parseSave(serializeSave(save), defaults).settings.controls).toEqual(controls);
  });

  it('un mapa manipulado vuelve entero al de fábrica sin tocar el resto de controles', () => {
    const base = defaults.settings.controls.keys;
    const hostile: unknown[] = [
      { ...base, throttle: ['Tab', null] },
      { ...base, pause: ['Escape', null] },
      { ...base, brake: ['KeyW', null] },
      { ...base, left: [null, null] },
      { ...base, camera: ['F3', null] },
      { ...base, respawn: ['x'.repeat(10_000), null] },
      { ...base, mute: ['KeyM', 'KeyN', 'KeyB'] },
      { throttle: ['KeyW', null] },
      [base.throttle],
      'KeyW',
      null,
    ];
    for (const keys of hostile) {
      const raw = JSON.stringify({ version: 1, settings: { controls: { keys, padDeadzone: 20 } } });
      const save = parseSave(raw, defaults);
      expect(save.settings.controls.keys).toEqual(base);
      expect(save.settings.controls.padDeadzone).toBe(20);
    }
  });

  it('rechaza la clave __proto__ en el mapa sin contaminar objetos', () => {
    const raw = `{"version":1,"settings":{"controls":{"keys":{"__proto__":{"polluted":true}}}}}`;
    const save = parseSave(raw, defaults);
    expect(save.settings.controls.keys).toEqual(defaults.settings.controls.keys);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('descarta respuesta, zona muerta y sensibilidad fuera de lista o de rango, y redondea al paso', () => {
    const bad = { keyboardSteer: 'turbo', padDeadzone: 50, padSensitivity: 10 };
    let save = parseSave(JSON.stringify({ version: 1, settings: { controls: bad } }), defaults);
    expect(save.settings.controls.keyboardSteer).toBe('direct');
    expect(save.settings.controls.padDeadzone).toBe(15);
    expect(save.settings.controls.padSensitivity).toBe(100);
    const odd = { padDeadzone: 12.6, padSensitivity: 124 };
    save = parseSave(JSON.stringify({ version: 1, settings: { controls: odd } }), defaults);
    expect(save.settings.controls.padDeadzone).toBe(13);
    expect(save.settings.controls.padSensitivity).toBe(120);
    for (const controls of ['x', 3, [1], null]) {
      save = parseSave(JSON.stringify({ version: 1, settings: { controls } }), defaults);
      expect(save.settings.controls).toEqual(defaults.settings.controls);
    }
  });
});
