import type { CarControls } from '../core/input';
import { clamp, moveToward } from '../core/math';
import { ASSISTS } from '../data/balance';
import type { CarParams } from '../data/cars';

/** Asistencias que el jugador puede activar en los ajustes. */
export interface AssistSettings {
  /** Suaviza la dirección y la reduce a alta velocidad (menos giros bruscos). */
  steering: boolean;
  /** Suelta el acelerador o frena si se llega demasiado rápido a una curva cerrada. */
  braking: boolean;
  /** Reaparece solo en el último control si el coche queda atascado. */
  autoRespawn: boolean;
}

export function defaultAssists(): AssistSettings {
  return { steering: false, braking: false, autoRespawn: true };
}

/** Estado interno de las asistencias entre pasos. */
export interface AssistState {
  /** Dirección suavizada por la ayuda de dirección. */
  steer: number;
  /** Perfil de velocidad prudente del circuito para la ayuda de frenado (se calcula al usarla). */
  brakeProfile: Float64Array | null;
}

export function createAssistState(): AssistState {
  return { steer: 0, brakeProfile: null };
}

/**
 * Ayuda de dirección: la dirección pedida cambia como mucho a una rapidez fija (un toque de tecla no da un
 * volantazo) y se reduce algo a alta velocidad. Modifica `controls` y devuelve el mismo objeto.
 */
export function applySteeringAssist(
  controls: CarControls,
  state: AssistState,
  speed: number,
  params: CarParams,
  dt: number,
): CarControls {
  const cut = 1 - ASSISTS.steerHighSpeedCut * clamp(Math.abs(speed) / params.maxSpeed, 0, 1);
  state.steer = moveToward(state.steer, clamp(controls.steer, -1, 1) * cut, ASSISTS.steerSlew * dt);
  controls.steer = state.steer;
  return controls;
}

/**
 * Ayuda de frenado: compara la velocidad con la velocidad prudente del tramo (la que permite la curva que
 * viene con margen). Un poco por encima, suelta el acelerador; bastante por encima, frena en proporción.
 * No acelera nunca por el jugador. Modifica `controls` y devuelve el mismo objeto.
 */
export function applyBrakingAssist(
  controls: CarControls,
  speed: number,
  safeSpeed: number,
): CarControls {
  const excess = speed - safeSpeed;
  if (excess > ASSISTS.brakeLiftMargin) controls.throttle = 0;
  if (excess > ASSISTS.brakeMargin) {
    controls.brake = Math.max(
      controls.brake,
      clamp((excess - ASSISTS.brakeMargin) / 4 + 0.3, 0, 1),
    );
  }
  return controls;
}

/**
 * Cuenta los pasos que el coche lleva atascado: casi parado mientras se intenta mover.
 * Devuelve el nuevo contador.
 */
export function updateStuck(
  steps: number,
  speed: number,
  controls: CarControls,
  stuckSpeed: number,
): number {
  const trying = controls.throttle > 0 || controls.brake > 0;
  return trying && Math.abs(speed) < stuckSpeed ? steps + 1 : 0;
}
