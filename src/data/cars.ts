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

export interface CarDef {
  id: string;
  name: string;
  bodyColor: number;
  accentColor: number;
  params: CarParams;
}

export const GORRION: CarDef = {
  id: 'gorrion',
  name: 'Gorrión',
  bodyColor: 0xf2a33a,
  accentColor: 0x23304a,
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

export const CARS: readonly CarDef[] = [GORRION];

/** Lista de los parámetros numéricos editables en el panel de depuración. */
export const CAR_PARAM_KEYS = Object.keys(GORRION.params) as (keyof CarParams)[];
