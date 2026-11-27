/**
 * Entrada del jugador como lógica pura: traduce códigos de tecla (`KeyboardEvent.code`) a acciones
 * y acciones a controles del coche. El adaptador que escucha el DOM vive en src/ui/keyboard.ts.
 */

import { DEFAULT_KEY_MAP, BINDABLE_ACTIONS, type KeyMap } from './bindings';
import { CONTROLS } from '../data/balance';

export type Action =
  'throttle' | 'brake' | 'left' | 'right' | 'handbrake' | 'respawn' | 'camera' | 'pause' | 'mute';

/** Teclas de juego. Se usa `code` (posición física) para que funcione en cualquier distribución. Sin Ctrl. */
export const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
  KeyR: 'respawn',
  KeyC: 'camera',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
};

/** Solo flechas y espacio bloquean la acción por defecto del navegador (desplazar la página). */
const PREVENT_DEFAULT_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Acción de un código con el mapa de fábrica (Esc incluido). Con teclas personalizadas usa `InputState`. */
export function actionForCode(code: string): Action | null {
  return Object.prototype.hasOwnProperty.call(KEY_BINDINGS, code)
    ? (KEY_BINDINGS[code] ?? null)
    : null;
}

/** Indica si una tecla debe llevar `preventDefault` mientras se juega. Tab y Esc nunca. */
export function shouldPreventDefault(code: string): boolean {
  return PREVENT_DEFAULT_CODES.has(code);
}

/** Respuesta de la dirección con teclado. */
export type KeyboardSteerResponse = 'direct' | 'normal' | 'smooth';

/**
 * Acerca `current` a `target` (-1..1) a la velocidad de CONTROLS.keyboardSteerRates[response]; al soltar o
 * invertir el sentido va CONTROLS.keyboardSteerReturnFactor veces más rápido. 'direct' devuelve target.
 */
export function smoothSteer(
  current: number,
  target: number,
  response: KeyboardSteerResponse,
  dt: number,
): number {
  const cur = Math.min(1, Math.max(-1, Number.isFinite(current) ? current : 0));
  const tgt = Math.min(1, Math.max(-1, Number.isFinite(target) ? target : 0));
  const rate = CONTROLS.keyboardSteerRates[response];
  if (response === 'direct' || rate <= 0) return tgt;
  if (!Number.isFinite(dt) || dt <= 0) return cur;
  const returning = tgt === 0 || (cur !== 0 && Math.sign(cur) !== Math.sign(tgt));
  const step = rate * (returning ? CONTROLS.keyboardSteerReturnFactor : 1) * dt;
  if (Math.abs(tgt - cur) <= step) return tgt;
  return cur + Math.sign(tgt - cur) * step;
}

/** Búsqueda inversa código -> acción; Esc siempre es pausa. */
function buildReverse(map: KeyMap): Map<string, Action> {
  const reverse = new Map<string, Action>();
  for (const action of BINDABLE_ACTIONS) {
    for (const code of map[action]) {
      if (code !== null && !reverse.has(code)) reverse.set(code, action);
    }
  }
  reverse.set('Escape', 'pause');
  return reverse;
}

/** Controles que recibe la física del coche en cada paso. */
export interface CarControls {
  /** Acelerador, 0..1. */
  throttle: number;
  /** Freno y marcha atrás, 0..1. */
  brake: number;
  /** Dirección pedida, -1 (derecha) .. 1 (izquierda). */
  steer: number;
  handbrake: boolean;
}

export function createControls(): CarControls {
  return { throttle: 0, brake: 0, steer: 0, handbrake: false };
}

export function resetControls(out: CarControls): CarControls {
  out.throttle = 0;
  out.brake = 0;
  out.steer = 0;
  out.handbrake = false;
  return out;
}

/**
 * Estado de las teclas pulsadas. Varias teclas pueden activar la misma acción (W y flecha arriba):
 * la acción sigue activa mientras quede alguna pulsada. Las acciones de un solo disparo (reaparecer,
 * pausa, cámara, silencio) se guardan como "pendientes" hasta que alguien las consume.
 */
export class InputState {
  private readonly downCodes = new Set<string>();
  private readonly pending = new Set<Action>();
  private reverse: Map<string, Action> = buildReverse(DEFAULT_KEY_MAP);

  /** Cambia las teclas del juego y suelta las pulsadas para no dejar acciones colgadas. */
  setKeyMap(map: KeyMap): void {
    this.reverse = buildReverse(map);
    this.clear();
  }

  /** Acción asociada a un código con el mapa actual, o null. */
  actionFor(code: string): Action | null {
    return this.reverse.get(code) ?? null;
  }

  /** Registra una tecla pulsada. Devuelve la acción asociada o null si la tecla no es del juego. */
  keyDown(code: string, isRepeat: boolean): Action | null {
    const action = this.reverse.get(code) ?? null;
    if (action === null) return null;
    this.downCodes.add(code);
    if (!isRepeat) this.pending.add(action);
    return action;
  }

  keyUp(code: string): Action | null {
    this.downCodes.delete(code);
    return this.reverse.get(code) ?? null;
  }

  isHeld(action: Action): boolean {
    for (const code of this.downCodes) {
      if (this.reverse.get(code) === action) return true;
    }
    return false;
  }

  /** Devuelve true una sola vez por pulsación de la acción. */
  consume(action: Action): boolean {
    return this.pending.delete(action);
  }

  /** Descarta un disparo pendiente sin usarlo. */
  discard(action: Action): void {
    this.pending.delete(action);
  }

  /** Suelta todo (al perder el foco, para que el coche no siga acelerando solo). */
  clear(): void {
    this.downCodes.clear();
    this.pending.clear();
  }

  /** Traduce las teclas mantenidas a controles digitales del coche. */
  toControls(out: CarControls): CarControls {
    out.throttle = this.isHeld('throttle') ? 1 : 0;
    out.brake = this.isHeld('brake') ? 1 : 0;
    out.steer = (this.isHeld('left') ? 1 : 0) - (this.isHeld('right') ? 1 : 0);
    out.handbrake = this.isHeld('handbrake');
    return out;
  }
}
