import { clamp, moveToward } from '../core/math';
import { EFFECTS } from '../data/balance';
import type { CarControls } from '../core/input';
import type { CarState } from './car';

/**
 * Señales de sensación de conducción derivadas del estado del coche. Son lógica pura que comparten
 * los efectos visuales y el sonido (derrape, luces de freno, tope de destellos).
 */

/**
 * Intensidad del derrape, 0..1: crece con el deslizamiento lateral y con el freno de mano a velocidad.
 * En el césped no hay chirrido de neumáticos ni marcas.
 */
export function skidIntensity(car: CarState, controls: CarControls): number {
  if (car.surface === 'grass') return 0;
  const slip = Math.abs(car.lateralSpeed);
  let level = clamp(
    (slip - EFFECTS.skidMinSlip) / (EFFECTS.skidFullSlip - EFFECTS.skidMinSlip),
    0,
    1,
  );
  if (controls.handbrake && Math.abs(car.forwardSpeed) > EFFECTS.handbrakeSkidSpeed) {
    level = Math.max(level, 0.35);
  }
  return level;
}

/**
 * Luz de freno con tiempo mínimo encendida y fundido. Aunque el jugador pulse y suelte el freno muy rápido,
 * la luz no destella más de unas 2 veces por segundo.
 */
export class BrakeLight {
  /** Brillo actual, 0..1. */
  level = 0;
  private hold = 0;

  update(braking: boolean, dt: number): number {
    if (braking) this.hold = EFFECTS.brakeLightMinOn;
    else this.hold = Math.max(0, this.hold - dt);
    const target = braking || this.hold > 0 ? 1 : 0;
    this.level = moveToward(this.level, target, EFFECTS.brakeLightFadeRate * dt);
    return this.level;
  }

  reset(): void {
    this.level = 0;
    this.hold = 0;
  }
}

/** Limita la frecuencia de un efecto (por ejemplo, ráfagas de chispas): como mucho uno cada `interval` s. */
export class RateLimiter {
  private wait = 0;

  constructor(private readonly interval: number) {}

  update(dt: number): void {
    this.wait = Math.max(0, this.wait - dt);
  }

  /** Devuelve true si el efecto puede ocurrir ahora (y empieza la espera). */
  tryFire(): boolean {
    if (this.wait > 0) return false;
    this.wait = this.interval;
    return true;
  }

  reset(): void {
    this.wait = 0;
  }
}
