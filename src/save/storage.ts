import {
  AUDIO,
  CAMERA,
  DIFFICULTIES,
  DYNAMIC_RESOLUTION,
  GRID,
  RACE,
  type Difficulty,
  type Quality,
} from '../data/balance';
import { defaultAssists, type AssistSettings } from '../game/assists';
import type { GameMode } from '../game/world';
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
  /** Último modo y dificultad elegidos. */
  mode: GameMode;
  difficulty: Difficulty;
  /** Volumen general (0–100). */
  volume: number;
  /** Música generativa activada. */
  music: boolean;
  /** Asistencias de conducción. */
  assists: AssistSettings;
  /** Resolución dinámica activada (baja la resolución interna si los FPS caen de forma sostenida). */
  dynamicResolution: boolean;
  /** Escala de resolución interna que dejó la resolución dinámica (1 = completa). */
  renderScale: number;
}

export interface SaveData {
  settings: Settings;
  /** Mejor vuelta (ms) por circuito y coche: bestLaps[circuito][coche]. */
  bestLaps: Record<string, Record<string, number>>;
  /** Mejor posición final (1–6) en el modo Carrera por circuito y dificultad: raceBest[circuito][dificultad]. */
  raceBest: Record<string, Partial<Record<Difficulty, number>>>;
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
      mode: 'timeTrial',
      difficulty: 'normal',
      volume: AUDIO.defaultVolume,
      music: true,
      assists: defaultAssists(),
      dynamicResolution: true,
      renderScale: 1,
    },
    bestLaps: {},
    raceBest: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

function validPosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= GRID.slots;
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
  const result: SaveData = {
    settings: { ...defaults.settings, assists: { ...defaults.settings.assists } },
    bestLaps: {},
    raceBest: {},
  };
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
    // Campos añadidos en el Hito 3.
    if (settings.mode === 'timeTrial' || settings.mode === 'race')
      result.settings.mode = settings.mode;
    if (isDifficulty(settings.difficulty)) result.settings.difficulty = settings.difficulty;
    const volume = settings.volume;
    if (typeof volume === 'number' && Number.isFinite(volume) && volume >= 0 && volume <= 100) {
      result.settings.volume = Math.round(volume);
    }
    if (typeof settings.music === 'boolean') result.settings.music = settings.music;
    const assists = settings.assists;
    if (isRecord(assists)) {
      for (const key of ['steering', 'braking', 'autoRespawn'] as const) {
        const value = assists[key];
        if (typeof value === 'boolean') result.settings.assists[key] = value;
      }
    }
    // Campos añadidos en el Hito 4. La escala solo se acepta si es uno de los escalones conocidos.
    if (typeof settings.dynamicResolution === 'boolean') {
      result.settings.dynamicResolution = settings.dynamicResolution;
    }
    const scale = settings.renderScale;
    if (
      typeof scale === 'number' &&
      (DYNAMIC_RESOLUTION.scales as readonly number[]).includes(scale)
    ) {
      result.settings.renderScale = scale;
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

  const raceBest = data.raceBest;
  if (isRecord(raceBest)) {
    let tracks = 0;
    for (const [trackId, entry] of Object.entries(raceBest)) {
      if (tracks >= MAX_TRACKS) break;
      if (!ID_PATTERN.test(trackId) || !isRecord(entry)) continue;
      const clean: Partial<Record<Difficulty, number>> = {};
      let count = 0;
      for (const difficulty of DIFFICULTIES) {
        const position = entry[difficulty];
        if (validPosition(position)) {
          clean[difficulty] = position;
          count++;
        }
      }
      if (count > 0) {
        result.raceBest[trackId] = clean;
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
    raceBest: data.raceBest,
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

  getRaceBest(trackId: string, difficulty: Difficulty): number | null {
    return this.data.raceBest[trackId]?.[difficulty] ?? null;
  }

  /** Registra una posición final de Carrera si mejora la anterior. Devuelve true si era la mejor. */
  recordRacePosition(trackId: string, difficulty: Difficulty, position: number): boolean {
    if (!validPosition(position) || !ID_PATTERN.test(trackId) || !isDifficulty(difficulty)) {
      return false;
    }
    const current = this.getRaceBest(trackId, difficulty);
    if (current !== null && current <= position) return false;
    const entry = this.data.raceBest[trackId] ?? {};
    entry[difficulty] = position;
    this.data.raceBest[trackId] = entry;
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
