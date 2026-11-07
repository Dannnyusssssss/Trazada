import { clamp } from '../core/math';
import { AUDIO, SIM } from '../data/balance';
import type { RaceState } from '../game/race';

/** Niveles de los efectos de sonido como lógica pura (el adaptador WebAudio solo los aplica). */

/** Viento, 0..1: crece con el cuadrado de la velocidad. */
export function windLevel(speed: number, maxSpeed: number): number {
  return clamp((Math.abs(speed) / Math.max(1, maxSpeed)) ** 2, 0, 1);
}

/** Volumen de un golpe, 0..1, según la velocidad de cierre (m/s). Los roces muy suaves no suenan. */
export function impactLevel(impactSpeed: number): number {
  if (impactSpeed < AUDIO.impactMinSpeed) return 0;
  return clamp((impactSpeed - AUDIO.impactMinSpeed) / AUDIO.impactFullSpeed, 0.15, 1);
}

/**
 * Atenuación y panorámica de un motor rival según su posición respecto al jugador.
 * `heading` es el rumbo del jugador; devuelve la ganancia (0..1) y la panorámica (-1 izquierda .. 1 derecha).
 */
export function rivalMix(
  dx: number,
  dz: number,
  heading: number,
  out: { gain: number; pan: number },
): { gain: number; pan: number } {
  const d = Math.hypot(dx, dz);
  out.gain = clamp(1 - d / AUDIO.rivalRange, 0, 1) ** 2;
  // Normal izquierda del jugador: (fz, -fx) con f = (cos h, -sin h).
  const lx = -Math.sin(heading);
  const lz = -Math.cos(heading);
  out.pan = d > 1e-3 ? clamp(-(dx * lx + dz * lz) / d, -1, 1) * AUDIO.rivalPan : 0;
  return out;
}

export type Cue = 'tick' | 'go' | 'lap' | 'finish';

/**
 * Detecta los momentos que llevan pitido: cada segundo de la cuenta atrás, la salida, cada vuelta completada
 * y la llegada. Todos tienen también su aviso visual en el HUD.
 */
export class CueTracker {
  private lastCount = -1;
  private lastPhase: RaceState['phase'] = 'countdown';
  private lastLaps = 0;

  reset(): void {
    this.lastCount = -1;
    this.lastPhase = 'countdown';
    this.lastLaps = 0;
  }

  /** Devuelve el aviso de este momento, o null. */
  update(race: RaceState): Cue | null {
    let cue: Cue | null = null;
    if (race.phase === 'countdown') {
      const count = Math.ceil(race.countdownSteps / SIM.hz);
      if (count !== this.lastCount && count > 0) cue = 'tick';
      this.lastCount = count;
    } else if (this.lastPhase === 'countdown' && race.phase === 'racing') {
      cue = 'go';
    }
    if (race.lapsCompleted > this.lastLaps) {
      cue = race.phase === 'finished' ? 'finish' : 'lap';
    }
    this.lastLaps = race.lapsCompleted;
    this.lastPhase = race.phase;
    return cue;
  }
}
