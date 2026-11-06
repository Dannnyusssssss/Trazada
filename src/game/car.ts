import type { CarControls } from '../core/input';
import { clamp, dampFactor, moveToward, wrapAngle } from '../core/math';
import { SURFACES, WALL, type Surface } from '../data/balance';
import type { CarParams } from '../data/cars';
import type { Track, TrackQuery } from './track';

/**
 * Estado físico de un coche en el plano del suelo.
 * Rumbo `heading`: la dirección del coche es (cos h, -sin h); al aumentar se gira a la izquierda.
 */
export interface CarState {
  x: number;
  z: number;
  heading: number;
  vx: number;
  vz: number;
  /** Velocidad de giro (rad/s), positiva a la izquierda. */
  yawRate: number;
  /** Posición del volante, -1 (derecha) .. 1 (izquierda). */
  steer: number;
  /** Ángulo de giro de las ruedas (para la animación). */
  wheelAngle: number;
  /** Velocidad en la dirección del coche (m/s); negativa en marcha atrás. */
  forwardSpeed: number;
  /** Deslizamiento lateral (m/s). */
  lateralSpeed: number;
  surface: Surface;
  /** Velocidad del último golpe contra el muro (m/s); 0 si no hubo golpe en este paso. */
  wallImpact: number;
}

export function createCarState(): CarState {
  return {
    x: 0,
    z: 0,
    heading: 0,
    vx: 0,
    vz: 0,
    yawRate: 0,
    steer: 0,
    wheelAngle: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    surface: 'asphalt',
    wallImpact: 0,
  };
}

export function copyCarState(out: CarState, a: CarState): CarState {
  out.x = a.x;
  out.z = a.z;
  out.heading = a.heading;
  out.vx = a.vx;
  out.vz = a.vz;
  out.yawRate = a.yawRate;
  out.steer = a.steer;
  out.wheelAngle = a.wheelAngle;
  out.forwardSpeed = a.forwardSpeed;
  out.lateralSpeed = a.lateralSpeed;
  out.surface = a.surface;
  out.wallImpact = a.wallImpact;
  return out;
}

/** Coloca el coche parado en un punto con un rumbo. */
export function placeCar(state: CarState, x: number, z: number, heading: number): void {
  state.x = x;
  state.z = z;
  state.heading = wrapAngle(heading);
  state.vx = 0;
  state.vz = 0;
  state.yawRate = 0;
  state.steer = 0;
  state.forwardSpeed = 0;
  state.lateralSpeed = 0;
  state.wallImpact = 0;
}

export function speedOf(state: CarState): number {
  return Math.hypot(state.vx, state.vz);
}

/**
 * Avanza la física arcade un paso fijo `dt`. Usa la superficie calculada en el paso anterior.
 * Modelo: velocidad descompuesta en avance y deslizamiento lateral respecto al coche; el motor y los frenos
 * actúan sobre el avance, el agarre amortigua el deslizamiento y el giro rota el coche. Como la velocidad
 * no rota con el coche, al girar aparece deslizamiento lateral, que el agarre va corrigiendo: eso da el derrape.
 */
export function stepCar(state: CarState, p: CarParams, controls: CarControls, dt: number): void {
  const surface = SURFACES[state.surface];
  const fx = Math.cos(state.heading);
  const fz = -Math.sin(state.heading);
  // Normal izquierda del coche.
  const lx = fz;
  const lz = -fx;
  let vf = state.vx * fx + state.vz * fz;
  let vl = state.vx * lx + state.vz * lz;

  // Volante: va hacia la posición pedida y vuelve al centro algo más rápido.
  const steerTarget = clamp(controls.steer, -1, 1);
  const returning =
    Math.abs(steerTarget) < Math.abs(state.steer) ||
    Math.sign(steerTarget) !== Math.sign(state.steer);
  state.steer = moveToward(
    state.steer,
    steerTarget,
    (returning ? p.steerReturnRate : p.steerRate) * dt,
  );

  // Fuerzas longitudinales.
  const throttle = clamp(controls.throttle, 0, 1);
  const brake = clamp(controls.brake, 0, 1);
  let accel = 0;
  if (throttle > 0) {
    if (vf >= -0.5) {
      const top = p.maxSpeed * surface.engine;
      accel += throttle * p.engineAccel * Math.max(0, 1 - vf / top);
    } else {
      // Acelerar yendo marcha atrás frena primero.
      accel += throttle * p.brakeDecel;
    }
  }
  if (brake > 0) {
    if (vf > 0.5) accel -= brake * p.brakeDecel;
    else accel -= brake * p.reverseAccel * Math.max(0, 1 - -vf / p.maxReverseSpeed);
  }
  vf += accel * dt;

  // Resistencias: siempre frenan hacia cero, sin cambiar el sentido de la marcha.
  const resistance =
    p.dragCoef * vf * vf +
    p.rollingResistance +
    surface.drag * Math.abs(vf) +
    (controls.handbrake ? p.handbrakeDecel : 0);
  vf = moveToward(vf, 0, resistance * dt);

  // Giro: se reduce a muy baja velocidad (no se gira parado) y algo a alta velocidad (estabilidad).
  const speedAbs = Math.abs(vf);
  const lowSpeedFactor = Math.min(1, speedAbs / p.turnFullSpeed);
  const highSpeedFactor = 1 - p.turnHighSpeedReduction * Math.min(1, speedAbs / p.maxSpeed);
  const direction = vf >= 0 ? 1 : -1;
  let targetYaw = state.steer * p.turnRate * lowSpeedFactor * highSpeedFactor * direction;
  if (controls.handbrake) targetYaw *= p.handbrakeTurnBoost;
  state.yawRate += (targetYaw - state.yawRate) * dampFactor(p.yawResponse, dt);

  // Agarre lateral: el deslizamiento decae exponencialmente; el freno de mano reduce el agarre trasero.
  const grip = p.lateralGrip * surface.grip * (controls.handbrake ? p.handbrakeGrip : 1);
  vl *= Math.exp(-grip * dt);

  // Velocidad recompuesta con la orientación de este paso; luego el coche rota.
  state.vx = fx * vf + lx * vl;
  state.vz = fz * vf + lz * vl;
  state.heading = wrapAngle(state.heading + state.yawRate * dt);
  state.x += state.vx * dt;
  state.z += state.vz * dt;
  state.forwardSpeed = vf;
  state.lateralSpeed = vl;
  state.wheelAngle = (state.wheelAngle + (vf * dt) / p.wheelRadius) % (Math.PI * 2);
}

/**
 * Contacto con la pista: superficie bajo el coche y choque con los muros laterales.
 * El muro saca al coche, anula la velocidad hacia él (con un pequeño rebote), resta algo de velocidad
 * paralela según la fuerza del golpe y alinea el coche con la pista: frena sin detenerlo en seco.
 */
export function resolveTrackContact(
  state: CarState,
  p: CarParams,
  track: Track,
  query: TrackQuery,
  dt: number,
): void {
  track.query(state.x, state.z, query);
  state.surface = query.surface;
  state.wallImpact = 0;

  const limit = track.wallDistance - p.collisionRadius;
  const excess = Math.abs(query.lateral) - limit;
  if (excess <= 0) return;

  // Normal izquierda de la pista; `side` vale 1 si el muro está a la izquierda.
  const side = query.lateral > 0 ? 1 : -1;
  const nx = query.tangentZ * side;
  const nz = -query.tangentX * side;
  // Saca el coche hasta el límite.
  state.x -= nx * excess;
  state.z -= nz * excess;
  query.lateral = side * limit;

  // Velocidad hacia el muro (positiva si se acerca) y velocidad paralela.
  const vn = state.vx * nx + state.vz * nz;
  if (vn > 0) {
    const tx = state.vx - nx * vn;
    const tz = state.vz - nz * vn;
    const tangentSpeed = Math.hypot(tx, tz);
    const keep =
      tangentSpeed > 1e-6 ? Math.max(0, tangentSpeed - WALL.friction * vn) / tangentSpeed : 0;
    state.vx = tx * keep - nx * vn * WALL.restitution;
    state.vz = tz * keep - nz * vn * WALL.restitution;
    state.wallImpact = vn;
  }

  // Alinea el rumbo con la dirección de la pista (en el sentido en que circula el coche).
  const trackHeading = Math.atan2(-query.tangentZ, query.tangentX);
  const forwardDot = Math.cos(state.heading - trackHeading);
  const target = forwardDot >= 0 ? trackHeading : trackHeading + Math.PI;
  const diff = wrapAngle(target - state.heading);
  // Solo corrige si el morro apunta hacia el muro.
  const fx = Math.cos(state.heading);
  const fz = -Math.sin(state.heading);
  if (fx * nx + fz * nz > 0) {
    state.heading = wrapAngle(state.heading + diff * dampFactor(WALL.alignRate, dt));
    state.yawRate *= 0.5;
  }
}
