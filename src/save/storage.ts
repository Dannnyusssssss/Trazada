import { CAMERA, RACE, type Quality } from '../data/balance';
import { META, SAVE_KEY } from '../data/meta';

/**
 * Guardado en localStorage con el prefijo del juego. Tolera datos ausentes, corruptos, antiguos o de tipos
 * inesperados: cada campo se valida por separado y lo que no es válido vuelve a su valor por defecto.
 * Si no se puede escribir (cuota llena, almacenamiento bloqueado) el juego sigue sin avisos.
 */

export interface Settings {
  muted: boolean;
  reducedMotion: boolean;
  /** Campo de visión base (grados). */
  fov: number;
  quality: Quality;
  camera: 'chase' | 'high';
  /** Última selección de circuito y coche (ids; se comprueba al usarlos que existan). */
  lastTrackId: string;
  lastCarId: string;
}

export interface SaveData {
  settings: Settings;
  /** Mejor vuelta (ms) por circuito y coche: bestLaps[circuito][coche]. */
  bestLaps: Record<string, Record<string, number>>;
}

/** Lo mínimo de la API Storage que se usa (permite probar con un almacenamiento falso). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Tamaño máximo que se acepta al leer (evita procesar datos absurdos). */
const MAX_RAW_LENGTH = 64 * 1024;
const MAX_TRACKS = 64;
const MAX_CARS_PER_TRACK = 32;
export const ID_PATTERN = /^[a-z0-9-]{1,32}$/;

export function defaultSave(prefersReducedMotion: boolean): SaveData {
  return {
    settings: {
      muted: false,
      reducedMotion: prefersReducedMotion,
      fov: CAMERA.fovDefault,
      quality: 'medium',
      camera: 'chase',
      lastTrackId: 'valle-solar',
      lastCarId: 'gorrion',
    },
    bestLaps: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validLapMs(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= RACE.minLapMs &&
    value <= RACE.maxLapMs
  );
}

/** Interpreta el texto guardado. Nunca lanza: ante cualquier problema usa los valores por defecto. */
export function parseSave(raw: string | null, defaults: SaveData): SaveData {
  const result: SaveData = { settings: { ...defaults.settings }, bestLaps: {} };
  if (raw === null || raw.length === 0 || raw.length > MAX_RAW_LENGTH) return result;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return result;
  }
  // Una versión distinta (o ausente) se trata como guardado desconocido.
  if (!isRecord(data) || data.version !== META.saveVersion) return result;

  const settings = data.settings;
  if (isRecord(settings)) {
    if (typeof settings.muted === 'boolean') result.settings.muted = settings.muted;
    if (typeof settings.reducedMotion === 'boolean')
      result.settings.reducedMotion = settings.reducedMotion;
    const fov = settings.fov;
    if (
      typeof fov === 'number' &&
      Number.isFinite(fov) &&
      fov >= CAMERA.fovMin &&
      fov <= CAMERA.fovMax
    ) {
      result.settings.fov = Math.round(fov);
    }
    // Campos añadidos en el Hito 2: si faltan (guardado anterior) quedan los valores por defecto.
    if (
      settings.quality === 'low' ||
      settings.quality === 'medium' ||
      settings.quality === 'high'
    ) {
      result.settings.quality = settings.quality;
    }
    if (settings.camera === 'chase' || settings.camera === 'high')
      result.settings.camera = settings.camera;
    if (typeof settings.lastTrackId === 'string' && ID_PATTERN.test(settings.lastTrackId)) {
      result.settings.lastTrackId = settings.lastTrackId;
    }
    if (typeof settings.lastCarId === 'string' && ID_PATTERN.test(settings.lastCarId)) {
      result.settings.lastCarId = settings.lastCarId;
    }
  }

  const bestLaps = data.bestLaps;
  if (isRecord(bestLaps)) {
    let tracks = 0;
    for (const [trackId, cars] of Object.entries(bestLaps)) {
      if (tracks >= MAX_TRACKS) break;
      if (!ID_PATTERN.test(trackId) || !isRecord(cars)) continue;
      const entry: Record<string, number> = {};
      let count = 0;
      for (const [carId, ms] of Object.entries(cars)) {
        if (count >= MAX_CARS_PER_TRACK) break;
        if (!ID_PATTERN.test(carId) || !validLapMs(ms)) continue;
        entry[carId] = ms;
        count++;
      }
      if (count > 0) {
        result.bestLaps[trackId] = entry;
        tracks++;
      }
    }
  }
  return result;
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify({
    version: META.saveVersion,
    settings: data.settings,
    bestLaps: data.bestLaps,
  });
}

export class SaveStore {
  data: SaveData;

  constructor(
    private readonly storage: StorageLike | null,
    defaults: SaveData,
  ) {
    this.data = parseSave(SaveStore.read(storage), defaults);
  }

  private static read(storage: StorageLike | null): string | null {
    try {
      return storage?.getItem(SAVE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  /** Escribe el guardado. Devuelve false si no se pudo (sin lanzar errores). */
  save(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, serializeSave(this.data));
      return true;
    } catch {
      return false;
    }
  }

  getBestLap(trackId: string, carId: string): number | null {
    return this.data.bestLaps[trackId]?.[carId] ?? null;
  }

  /** Registra una vuelta si mejora el récord. Devuelve true si era récord. */
  recordLap(trackId: string, carId: string, ms: number): boolean {
    if (!validLapMs(ms) || !ID_PATTERN.test(trackId) || !ID_PATTERN.test(carId)) return false;
    const current = this.getBestLap(trackId, carId);
    if (current !== null && current <= ms) return false;
    const entry = this.data.bestLaps[trackId] ?? {};
    entry[carId] = ms;
    this.data.bestLaps[trackId] = entry;
    this.save();
    return true;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.save();
  }
}

/** Devuelve localStorage si el navegador lo permite (puede estar bloqueado o lanzar al acceder). */
export function browserStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}
