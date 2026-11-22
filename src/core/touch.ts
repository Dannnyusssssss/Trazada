import type { Action, CarControls } from './input';

/**
 * Controles táctiles como lógica pura: registra varios punteros a la vez, cada uno sobre un botón de la
 * pantalla, y los traduce a controles del coche y a acciones de un solo disparo. El adaptador que escucha
 * los eventos de puntero y dibuja los botones vive en src/ui.
 */

export type TouchButton =
  'left' | 'right' | 'throttle' | 'brake' | 'handbrake' | 'respawn' | 'camera' | 'pause';

/** Máximo de punteros simultáneos; los que excedan se ignoran. */
export const MAX_TOUCH_POINTERS = 10;

const BUTTONS: readonly TouchButton[] = [
  'left',
  'right',
  'throttle',
  'brake',
  'handbrake',
  'respawn',
  'camera',
  'pause',
];

/** Botones de un solo disparo: generan la acción al bajar el dedo sobre ellos. */
const ONE_SHOT: readonly (TouchButton & Action)[] = ['respawn', 'camera', 'pause'];

function isValidButton(button: unknown): button is TouchButton {
  return typeof button === 'string' && (BUTTONS as readonly string[]).includes(button);
}

function isOneShot(button: TouchButton): boolean {
  return (ONE_SHOT as readonly string[]).includes(button);
}

export interface TouchOptions {
  /** Aceleración automática: ver `TouchState.toControls`. */
  autoThrottle: boolean;
}

export class TouchState {
  /** Botón sobre el que está cada puntero registrado (null si está fuera de todos). */
  private readonly pointers = new Map<number, TouchButton | null>();
  /** Cuántos punteros hay sobre cada botón (evita recorrer el mapa en cada paso). */
  private readonly counts: Record<TouchButton, number> = {
    left: 0,
    right: 0,
    throttle: 0,
    brake: 0,
    handbrake: 0,
    respawn: 0,
    camera: 0,
    pause: 0,
  };
  private readonly pending: Record<TouchButton, boolean> = {
    left: false,
    right: false,
    throttle: false,
    brake: false,
    handbrake: false,
    respawn: false,
    camera: false,
    pause: false,
  };

  /** Número de punteros registrados. */
  get activePointers(): number {
    return this.pointers.size;
  }

  /** Un dedo (o lápiz) baja sobre un botón. El ratón y los identificadores inválidos se ignoran. */
  down(pointerId: number, pointerType: string, button: TouchButton): void {
    if (!Number.isInteger(pointerId)) return;
    if (pointerType !== 'touch' && pointerType !== 'pen') return;
    if (!isValidButton(button)) return;
    if (this.pointers.has(pointerId)) {
      this.move(pointerId, button);
      return;
    }
    if (this.pointers.size >= MAX_TOUCH_POINTERS) return;
    this.pointers.set(pointerId, button);
    this.counts[button] += 1;
    if (isOneShot(button)) this.pending[button] = true;
  }

  /** El dedo se levanta. Un puntero no registrado se ignora. */
  up(pointerId: number): void {
    this.release(pointerId);
  }

  /** El sistema cancela el puntero (pointercancel). Equivale a soltarlo. */
  cancel(pointerId: number): void {
    this.release(pointerId);
  }

  /**
   * El dedo se desliza a otro botón (o fuera de todos con null). Deslizar hacia un botón de un solo disparo
   * no lo dispara: solo cuenta la pulsación inicial.
   */
  move(pointerId: number, button: TouchButton | null): void {
    if (!Number.isInteger(pointerId)) return;
    if (!this.pointers.has(pointerId)) return;
    if (button !== null && !isValidButton(button)) return;
    const previous = this.pointers.get(pointerId) ?? null;
    if (previous === button) return;
    if (previous !== null) this.counts[previous] -= 1;
    if (button !== null) this.counts[button] += 1;
    this.pointers.set(pointerId, button);
  }

  /** Suelta todo (pointercancel global, pérdida de foco, pestaña oculta). Descarta los disparos pendientes. */
  releaseAll(): void {
    this.pointers.clear();
    for (const button of BUTTONS) {
      this.counts[button] = 0;
      this.pending[button] = false;
    }
  }

  isHeld(button: TouchButton): boolean {
    return this.counts[button] > 0;
  }

  /**
   * Traduce los botones mantenidos a controles digitales del coche. Dirección con el mismo signo que el
   * teclado: izquierda = +1, derecha = -1, ambos a la vez = 0.
   *
   * Aceleración automática: mientras `autoThrottle` esté activo, el acelerador vale 1 salvo que el freno
   * esté pulsado; en ese caso acelerador 0 y freno 1. Sin ella, el acelerador sigue al botón.
   */
  toControls(out: CarControls, options: TouchOptions): CarControls {
    const braking = this.isHeld('brake');
    out.steer = (this.isHeld('left') ? 1 : 0) - (this.isHeld('right') ? 1 : 0);
    out.brake = braking ? 1 : 0;
    if (options.autoThrottle) out.throttle = braking ? 0 : 1;
    else out.throttle = this.isHeld('throttle') ? 1 : 0;
    out.handbrake = this.isHeld('handbrake');
    return out;
  }

  /** Vacía en `out` las acciones pulsadas desde la última llamada (una vez por pulsación). */
  consumeActions(out: Action[]): Action[] {
    out.length = 0;
    for (const action of ONE_SHOT) {
      if (this.pending[action]) {
        this.pending[action] = false;
        out.push(action);
      }
    }
    return out;
  }

  private release(pointerId: number): void {
    if (!Number.isInteger(pointerId)) return;
    if (!this.pointers.has(pointerId)) return;
    const previous = this.pointers.get(pointerId) ?? null;
    if (previous !== null) this.counts[previous] -= 1;
    this.pointers.delete(pointerId);
  }
}

/** Tamaño de los botones táctiles. */
export type TouchSize = 'small' | 'medium' | 'large';
export const TOUCH_SIZES: readonly TouchSize[] = ['small', 'medium', 'large'];

/** Opacidad del relleno de los botones, en porcentaje (el icono y el borde siempre son opacos). */
export const TOUCH_OPACITY = { min: 40, max: 100, step: 10, default: 60 } as const;

/** Ajustes táctiles guardados. */
export interface TouchSettings {
  /** Modo zurdo: dirección a la derecha y pedales a la izquierda. */
  leftHanded: boolean;
  size: TouchSize;
  /** Opacidad del relleno (TOUCH_OPACITY.min–max). */
  opacity: number;
  /** Aceleración automática (ver `TouchState.toControls`). */
  autoThrottle: boolean;
}

export function defaultTouchSettings(): TouchSettings {
  return { leftHanded: false, size: 'medium', opacity: TOUCH_OPACITY.default, autoThrottle: true };
}

export type LayoutSide = 'start' | 'end';

export interface TouchLayout {
  /** Lado de la pantalla del grupo de dirección (◀ ▶). */
  steer: LayoutSide;
  /** Lado del grupo de pedales (acelerar, freno, freno de mano). */
  pedals: LayoutSide;
}

/**
 * Distribución según la mano: diestro con la dirección a la izquierda y los pedales a la derecha; zurdo al
 * revés. Solo se espeja la posición: ◀ sigue girando a la izquierda.
 */
export function mirrorLayout(leftHanded: boolean): TouchLayout {
  return leftHanded ? { steer: 'end', pedals: 'start' } : { steer: 'start', pedals: 'end' };
}
