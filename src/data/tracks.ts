/**
 * Circuitos como datos. Los puntos de control definen una curva cerrada (spline Catmull-Rom centrípeta)
 * en el plano del suelo, en metros. El sentido de carrera es el orden de los puntos.
 * La meta está en el primer punto; los checkpoints se reparten a intervalos iguales a lo largo de la vuelta.
 */

export interface TrackPalette {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  ground: number;
  groundDetail: number;
  asphalt: number;
  asphaltDetail: number;
  line: number;
  curbA: number;
  curbB: number;
  barrierA: number;
  barrierB: number;
  sunColor: number;
  sunIntensity: number;
  /** Dirección hacia el sol (no hace falta que sea unitaria). */
  sunDirection: readonly [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
}

export interface TrackDef {
  id: string;
  name: string;
  /** Puntos de control [x, z] en metros, en sentido de carrera. */
  points: readonly (readonly [number, number])[];
  /** Ancho del asfalto (m). */
  width: number;
  /** Número de checkpoints, contando la meta como el checkpoint 0. */
  checkpointCount: number;
  /** Semilla para todo lo aleatorio del circuito (texturas, escenario). */
  seed: number;
  palette: TrackPalette;
}

export const VALLE_SOLAR: TrackDef = {
  id: 'valle-solar',
  name: 'Valle Solar',
  points: [
    [0, -150],
    [180, -160],
    [320, -120],
    [380, -20],
    [340, 80],
    [240, 110],
    [170, 190],
    [60, 230],
    [-80, 200],
    [-200, 230],
    [-310, 170],
    [-340, 40],
    [-270, -60],
    [-160, -110],
  ],
  width: 14,
  checkpointCount: 8,
  seed: 20261106,
  palette: {
    skyTop: 0x3f6fb8,
    skyHorizon: 0xffc794,
    skyBottom: 0xf3b98a,
    fog: 0xf1c6a0,
    fogNear: 120,
    fogFar: 900,
    ground: 0x6fa64a,
    groundDetail: 0x5d9440,
    asphalt: 0x4a4d57,
    asphaltDetail: 0x585b66,
    line: 0xf4f1e8,
    curbA: 0xd8402f,
    curbB: 0xf4f1e8,
    barrierA: 0x2f6fd8,
    barrierB: 0xf4f1e8,
    sunColor: 0xffd9a8,
    sunIntensity: 2.4,
    sunDirection: [-0.6, 0.45, -0.65],
    hemiSky: 0xbcd3ff,
    hemiGround: 0x6b7a3e,
    hemiIntensity: 1.1,
  },
};

export const TRACKS: readonly TrackDef[] = [VALLE_SOLAR];
