/**
 * Coches como datos: parámetros de la física arcade y colores de la malla.
 * Las unidades son metros, segundos y radianes. Los nombres son inventados.
 */

export interface CarParams {
  /** Velocidad máxima que puede dar el motor (m/s). */
  maxSpeed: number;
  /** Aceleración del motor desde parado (m/s²); se reduce al acercarse a la velocidad máxima. */
  engineAccel: number;
  /** Deceleración al frenar (m/s²). */
  brakeDecel: number;
  /** Aceleración en marcha atrás (m/s²). */
  reverseAccel: number;
  /** Velocidad máxima en marcha atrás (m/s). */
  maxReverseSpeed: number;
  /** Resistencia aerodinámica: deceleración = coef · v² (1/m). */
  dragCoef: number;
  /** Resistencia a la rodadura (m/s²). */
  rollingResistance: number;
  /** Velocidad de giro máxima (rad/s). */
  turnRate: number;
  /** Velocidad (m/s) a partir de la cual el giro es completo; por debajo, el coche gira menos. */
  turnFullSpeed: number;
  /** Fracción del giro que se pierde a velocidad máxima (estabilidad a alta velocidad). */
  turnHighSpeedReduction: number;
  /** Rapidez con la que la velocidad de giro alcanza la pedida (1/s). */
  yawResponse: number;
  /** Agarre lateral: rapidez con la que desaparece el deslizamiento lateral (1/s). */
  lateralGrip: number;
  /** Multiplicador del agarre lateral con el freno de mano. */
  handbrakeGrip: number;
  /** Multiplicador del giro con el freno de mano (provoca el derrape). */
  handbrakeTurnBoost: number;
  /** Deceleración del freno de mano (m/s²). */
  handbrakeDecel: number;
  /** Rapidez con la que el volante va hacia la dirección pedida (1/s). */
  steerRate: number;
  /** Rapidez con la que el volante vuelve al centro (1/s). */
  steerReturnRate: number;
  /** Radio del coche para chocar con los muros (m). */
  collisionRadius: number;
  /** Radio de las ruedas (m), para la animación. */
  wheelRadius: number;
}

/** Silueta de la malla low-poly (solo visual). */
export interface CarShape {
  /** Escala del largo y del ancho de la carrocería. */
  length: number;
  width: number;
  /** Escala del largo de la cabina. */
  cabin: number;
  wing: 'none' | 'low' | 'high';
}

export interface CarDef {
  id: string;
  name: string;
  /** Descripción corta para la pantalla de selección. */
  description: string;
  bodyColor: number;
  accentColor: number;
  shape: CarShape;
  params: CarParams;
}

export const GORRION: CarDef = {
  id: 'gorrion',
  name: 'Gorrión',
  description: 'Equilibrado: buena aceleración y giro predecible.',
  bodyColor: 0xf2a33a,
  accentColor: 0x23304a,
  shape: { length: 1, width: 1, cabin: 1, wing: 'low' },
  params: {
    maxSpeed: 48,
    engineAccel: 15,
    brakeDecel: 26,
    reverseAccel: 8,
    maxReverseSpeed: 11,
    dragCoef: 0.0007,
    rollingResistance: 0.5,
    turnRate: 1.9,
    turnFullSpeed: 7,
    turnHighSpeedReduction: 0.42,
    yawResponse: 9,
    lateralGrip: 9,
    handbrakeGrip: 0.22,
    handbrakeTurnBoost: 1.35,
    handbrakeDecel: 5,
    steerRate: 6,
    steerReturnRate: 9,
    collisionRadius: 1.05,
    wheelRadius: 0.36,
  },
};

export const CONDOR: CarDef = {
  id: 'condor',
  name: 'Cóndor',
  description: 'Rápido en recta; gira más despacio y pide frenar antes.',
  bodyColor: 0x3fa7e8,
  accentColor: 0xf4f1e8,
  shape: { length: 1.08, width: 1.03, cabin: 0.9, wing: 'high' },
  params: {
    ...GORRION.params,
    maxSpeed: 53,
    engineAccel: 14,
    brakeDecel: 27,
    turnRate: 1.62,
    turnHighSpeedReduction: 0.46,
    lateralGrip: 8.4,
    collisionRadius: 1.1,
  },
};

export const ZORRO: CarDef = {
  id: 'zorro',
  name: 'Zorro',
  description: 'Ágil y con mucho agarre; menos velocidad punta.',
  bodyColor: 0xd8452f,
  accentColor: 0x1d1f26,
  shape: { length: 0.92, width: 0.97, cabin: 1.05, wing: 'none' },
  params: {
    ...GORRION.params,
    maxSpeed: 44,
    engineAccel: 16.5,
    brakeDecel: 27,
    turnRate: 2.25,
    turnHighSpeedReduction: 0.36,
    lateralGrip: 10.5,
    handbrakeGrip: 0.26,
    collisionRadius: 1.0,
  },
};

export const CARS: readonly CarDef[] = [GORRION, CONDOR, ZORRO];

export function carById(id: string): CarDef | null {
  return CARS.find((c) => c.id === id) ?? null;
}

/** Lista de los parámetros numéricos editables en el panel de depuración. */
export const CAR_PARAM_KEYS = Object.keys(GORRION.params) as (keyof CarParams)[];
