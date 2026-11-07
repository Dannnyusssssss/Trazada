import { clamp } from './math';
import type { Action, CarControls } from './input';

/**
 * Mando como lógica pura: traduce una lectura del mando (ejes y botones con la distribución estándar de la
 * Gamepad API) a controles del coche y a acciones de un solo disparo. El adaptador que lee el navegador
 * vive en src/ui/gamepad.ts.
 */

/** Lectura del mando en un instante: ejes en -1..1 y botones en 0..1. */
export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: readonly number[];
}

/** Botones y ejes de la distribución estándar ("standard mapping"). */
export const PAD = {
  /** Eje horizontal del stick izquierdo. */
  steerAxis: 0,
  /** Gatillo derecho (acelerar) e izquierdo (frenar y marcha atrás). */
  throttle: 7,
  brake: 6,
  /** A: freno de mano. Y: reaparecer. X: cámara. Start: pausa. */
  handbrake: 0,
  respawn: 3,
  camera: 2,
  pause: 9,
  /** Cruceta izquierda y derecha (dirección digital). */
  dpadLeft: 14,
  dpadRight: 15,
} as const;

/** Zona muerta del stick y de los gatillos, y umbral para considerar pulsado un botón. */
export const PAD_DEADZONE = 0.15;
export const TRIGGER_DEADZONE = 0.05;
export const PRESS_THRESHOLD = 0.5;

/** Acciones de un solo disparo y su botón. */
const ONE_SHOT: readonly (readonly [Action, number])[] = [
  ['respawn', PAD.respawn],
  ['camera', PAD.camera],
  ['pause', PAD.pause],
];

/**
 * Zona muerta con reescalado: por debajo de `deadzone` vale 0 y por encima va de 0 a 1 sin salto,
 * así un stick que no vuelve del todo al centro no mueve el coche y se conserva todo el recorrido.
 */
export function applyDeadzone(value: number, deadzone: number): number {
  const v = clamp(Number.isFinite(value) ? value : 0, -1, 1);
  const magnitude = Math.abs(v);
  if (magnitude <= deadzone) return 0;
  return (Math.sign(v) * (magnitude - deadzone)) / (1 - deadzone);
}

/** Controles analógicos del coche a partir de una lectura del mando. Escribe en `out` y lo devuelve. */
export function padToControls(pad: GamepadSnapshot, out: CarControls): CarControls {
  const button = (i: number): number => clamp(pad.buttons[i] ?? 0, 0, 1);
  out.throttle = applyDeadzone(button(PAD.throttle), TRIGGER_DEADZONE);
  out.brake = applyDeadzone(button(PAD.brake), TRIGGER_DEADZONE);
  // Stick a la izquierda (eje negativo) = girar a la izquierda (dirección positiva).
  const stick = applyDeadzone(pad.axes[PAD.steerAxis] ?? 0, PAD_DEADZONE);
  let steer = stick === 0 ? 0 : -stick;
  if (button(PAD.dpadLeft) > PRESS_THRESHOLD) steer = 1;
  if (button(PAD.dpadRight) > PRESS_THRESHOLD) steer = -1;
  out.steer = steer;
  out.handbrake = button(PAD.handbrake) > PRESS_THRESHOLD;
  return out;
}

/**
 * Une el teclado y el mando: el acelerador y el freno toman el mayor, la dirección la de mayor magnitud y el
 * freno de mano cualquiera de los dos. Escribe en `out` y lo devuelve.
 */
export function mergeControls(a: CarControls, b: CarControls, out: CarControls): CarControls {
  out.throttle = Math.max(a.throttle, b.throttle);
  out.brake = Math.max(a.brake, b.brake);
  out.steer = Math.abs(b.steer) > Math.abs(a.steer) ? b.steer : a.steer;
  out.handbrake = a.handbrake || b.handbrake;
  return out;
}

/** Detecta los botones de un solo disparo por flanco (al pasar de suelto a pulsado). */
export class PadButtons {
  private readonly held = new Set<Action>();

  /** Devuelve las acciones que se acaban de pulsar en esta lectura. */
  update(pad: GamepadSnapshot, out: Action[]): Action[] {
    out.length = 0;
    for (const [action, index] of ONE_SHOT) {
      const down = (pad.buttons[index] ?? 0) > PRESS_THRESHOLD;
      if (down && !this.held.has(action)) out.push(action);
      if (down) this.held.add(action);
      else this.held.delete(action);
    }
    return out;
  }

  clear(): void {
    this.held.clear();
  }
}
