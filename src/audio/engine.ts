import { clamp } from '../core/math';
import { AUDIO } from '../data/balance';

/**
 * Sonido del motor como lógica pura: una caja de cambios simulada convierte la velocidad en RPM, y las RPM y la
 * carga (acelerador) en la frecuencia, el brillo (corte del filtro) y el volumen del motor sintetizado.
 * La frecuencia más grave está por encima de ~70 Hz para que se oiga en altavoces de portátil.
 */

export interface EngineVoice {
  /** Frecuencia fundamental (Hz). */
  frequency: number;
  /** Corte del filtro paso bajo (Hz): más abierto con más RPM y más acelerador. */
  cutoff: number;
  /** Volumen relativo, 0..1. */
  gain: number;
}

export function createEngineVoice(): EngineVoice {
  return { frequency: AUDIO.engineMinHz, cutoff: AUDIO.engineMinCutoff, gain: 0 };
}

/**
 * Caja de cambios simulada: cada marcha cubre una franja de la velocidad máxima. Sube de marcha cerca del final
 * de la franja y baja con histéresis, para que no cambie de marcha una y otra vez en el límite.
 */
export class Gearbox {
  gear = 1;
  /** RPM normalizadas, 0 (ralentí) .. 1 (corte). */
  rpm: number = AUDIO.rpmIdle;

  /** Actualiza con la velocidad como fracción de la velocidad máxima (sin signo). Devuelve las RPM. */
  update(speedFraction: number): number {
    const s = clamp(Math.abs(speedFraction), 0, 1.2);
    const tops = AUDIO.gearTops;
    const last = tops.length;
    while (this.gear < last && s > (tops[this.gear - 1] ?? 1) * AUDIO.upshiftAt) this.gear++;
    while (this.gear > 1 && s < (tops[this.gear - 2] ?? 0) * AUDIO.downshiftAt) this.gear--;
    const top = tops[this.gear - 1] ?? 1;
    this.rpm = AUDIO.rpmIdle + (1 - AUDIO.rpmIdle) * clamp(s / top, 0, 1);
    return this.rpm;
  }

  reset(): void {
    this.gear = 1;
    this.rpm = AUDIO.rpmIdle;
  }
}

/** Voz del motor para unas RPM y un acelerador (0..1). Escribe en `out` y lo devuelve. */
export function engineVoice(rpm: number, throttle: number, out: EngineVoice): EngineVoice {
  const r = clamp(rpm, 0, 1);
  const load = clamp(throttle, 0, 1);
  out.frequency = AUDIO.engineMinHz + (AUDIO.engineMaxHz - AUDIO.engineMinHz) * r;
  out.cutoff =
    AUDIO.engineMinCutoff +
    (AUDIO.engineMaxCutoff - AUDIO.engineMinCutoff) * r * (0.35 + 0.65 * load);
  out.gain = AUDIO.engineIdleGain + (1 - AUDIO.engineIdleGain) * (0.45 * r + 0.55 * load);
  return out;
}
