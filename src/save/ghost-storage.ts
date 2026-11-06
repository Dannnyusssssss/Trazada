import { GHOST, RACE } from '../data/balance';
import { META } from '../data/meta';
import { GHOST_MAX_SAMPLES, expectedSamples, type GhostData } from '../game/ghost';
import { ID_PATTERN, type StorageLike } from './storage';

/**
 * Fantasmas en localStorage, uno por circuito, con la clave `trazada:ghost:<circuito>:v1`.
 * Las muestras se guardan como enteros de 32 bits (little-endian) en base64. Todo se valida al leer:
 * un fantasma corrupto, antiguo o desproporcionado se ignora sin romper el juego.
 */

const GHOST_VERSION = 1;
const BYTES_PER_SAMPLE = 12;
/** Tamaño máximo del texto guardado (base64 de la vuelta más larga permitida, con margen). */
const MAX_RAW_LENGTH = Math.ceil((GHOST_MAX_SAMPLES * BYTES_PER_SAMPLE * 4) / 3) + 1024;

export function ghostKey(trackId: string): string {
  return `${META.storagePrefix}ghost:${trackId}:v${GHOST_VERSION}`;
}

function toBase64(samples: Int32Array): string {
  const bytes = new Uint8Array(samples.length * 4);
  const view = new DataView(bytes.buffer);
  samples.forEach((v, i) => view.setInt32(i * 4, v, true));
  let binary = '';
  // Por tramos para no pasar demasiados argumentos de golpe.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(text: string): Int32Array | null {
  let binary: string;
  try {
    binary = atob(text);
  } catch {
    return null;
  }
  if (binary.length % BYTES_PER_SAMPLE !== 0) return null;
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const out = new Int32Array(binary.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt32(i * 4, true);
  return out;
}

export function serializeGhost(data: GhostData): string {
  return JSON.stringify({
    version: GHOST_VERSION,
    trackId: data.trackId,
    carId: data.carId,
    lapMs: data.lapMs,
    hz: GHOST.hz,
    samples: toBase64(data.samples),
  });
}

/**
 * Interpreta un fantasma guardado para `trackId`. Comprueba formato, versión, ids, tiempo, frecuencia,
 * tamaño y que el número de muestras cuadre con el tiempo. La coherencia con la pista se comprueba aparte
 * (validateGhost), porque necesita el circuito.
 */
export function parseGhost(raw: string | null, trackId: string): GhostData | null {
  if (raw === null || raw.length === 0 || raw.length > MAX_RAW_LENGTH) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.version !== GHOST_VERSION || record.hz !== GHOST.hz) return null;
  if (record.trackId !== trackId) return null;
  const carId = record.carId;
  const lapMs = record.lapMs;
  const encoded = record.samples;
  if (typeof carId !== 'string' || !ID_PATTERN.test(carId)) return null;
  if (typeof lapMs !== 'number' || !Number.isFinite(lapMs)) return null;
  if (lapMs < RACE.minLapMs || lapMs > GHOST.maxSeconds * 1000) return null;
  if (typeof encoded !== 'string') return null;
  const samples = fromBase64(encoded);
  if (!samples) return null;
  const count = samples.length / 3;
  if (count < 2 || count > GHOST_MAX_SAMPLES) return null;
  if (Math.abs(count - expectedSamples(lapMs)) > 2) return null;
  return { trackId, carId, lapMs, samples };
}

export class GhostStore {
  constructor(private readonly storage: StorageLike | null) {}

  load(trackId: string): GhostData | null {
    try {
      return parseGhost(this.storage?.getItem(ghostKey(trackId)) ?? null, trackId);
    } catch {
      return null;
    }
  }

  /** Guarda el fantasma de su circuito. Devuelve false si no se pudo (por ejemplo, cuota llena). */
  save(data: GhostData): boolean {
    if (!this.storage || !ID_PATTERN.test(data.trackId)) return false;
    try {
      this.storage.setItem(ghostKey(data.trackId), serializeGhost(data));
      return true;
    } catch {
      return false;
    }
  }
}
