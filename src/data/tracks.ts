/**
 * Circuitos como datos. Los puntos de control definen una curva cerrada (spline Catmull-Rom centrípeta)
 * en el plano del suelo, en metros: [x, z, altura]. El sentido de carrera es el orden de los puntos.
 * La meta está en el primer punto; los checkpoints se reparten a intervalos iguales a lo largo de la vuelta.
 * Los circuitos van de menos a más difíciles, en el orden de TRACKS.
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
  /** Dirección hacia el sol o la luna (no hace falta que sea unitaria). */
  sunDirection: readonly [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Colores del escenario: copas de árbol, rocas, fachadas y luces fijas (ventanas, farolas). */
  foliage: readonly number[];
  rock: number;
  facades: readonly number[];
  lights: readonly number[];
}

export type SceneryKind = 'pine' | 'broadleaf' | 'rock' | 'building';

/** Regla de colocación de un tipo de objeto del escenario, a cierta distancia del muro. */
export interface SceneryRule {
  kind: SceneryKind;
  count: number;
  /** Distancia mínima y máxima desde el muro (m). */
  minDistance: number;
  maxDistance: number;
  scaleMin: number;
  scaleMax: number;
}

export interface MedalTimes {
  /** Tiempos de vuelta objetivo (ms). Oro < plata < bronce. */
  gold: number;
  silver: number;
  bronze: number;
}

export interface TrackDef {
  id: string;
  name: string;
  /** Descripción corta para la pantalla de selección. */
  description: string;
  /** Puntos de control [x, z, altura] en metros, en sentido de carrera. */
  points: readonly (readonly [number, number, number])[];
  /** Ancho del asfalto (m). */
  width: number;
  /** Franja de césped entre el asfalto y el muro (m). */
  runoff: number;
  /** Factor de peralte, 0 (llano) .. 1. */
  banking: number;
  /** Número de checkpoints, contando la meta como el checkpoint 0. */
  checkpointCount: number;
  /** Semilla para todo lo aleatorio del circuito (texturas, escenario). */
  seed: number;
  medals: MedalTimes;
  scenery: readonly SceneryRule[];
  /** Separación de las farolas a lo largo de la pista (m); 0 = sin farolas. */
  lampSpacing: number;
  /** Circuito nocturno: los coches llevan los faros encendidos con su haz sobre el asfalto. */
  night: boolean;
  palette: TrackPalette;
}

export const VALLE_SOLAR: TrackDef = {
  id: 'valle-solar',
  name: 'Valle Solar',
  description: 'Amanecer entre lomas suaves. Ancho y fluido: ideal para empezar.',
  points: [
    [0, -150, 0],
    [180, -160, 1],
    [320, -120, 3],
    [380, -20, 6],
    [340, 80, 8],
    [240, 110, 7],
    [170, 190, 5],
    [60, 230, 4],
    [-80, 200, 5],
    [-200, 230, 7],
    [-310, 170, 6],
    [-340, 40, 3],
    [-270, -60, 1],
    [-160, -110, 0],
  ],
  width: 14,
  runoff: 6,
  banking: 0.6,
  checkpointCount: 8,
  seed: 20261106,
  night: false,
  medals: { gold: 52_500, silver: 59_000, bronze: 72_000 },
  scenery: [
    {
      kind: 'broadleaf',
      count: 170,
      minDistance: 4,
      maxDistance: 110,
      scaleMin: 0.8,
      scaleMax: 1.4,
    },
    { kind: 'pine', count: 110, minDistance: 6, maxDistance: 130, scaleMin: 0.8, scaleMax: 1.3 },
    { kind: 'rock', count: 40, minDistance: 2, maxDistance: 90, scaleMin: 0.6, scaleMax: 1.6 },
  ],
  lampSpacing: 0,
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
    foliage: [0x3f8a3a, 0x4f9a3c, 0x6aa840, 0x8fb246],
    rock: 0x9a8f86,
    facades: [0xd9cbb4],
    lights: [0xfff1c4],
  },
};

export const CUMBRE: TrackDef = {
  id: 'cumbre',
  name: 'Cumbre',
  description: 'Ocaso en la montaña. Subidas, bajadas y horquillas cerradas.',
  points: [
    [0, 0, 0],
    [150, 10, 3],
    [260, -30, 8],
    [300, -120, 14],
    [250, -190, 19],
    [160, -200, 23],
    [90, -250, 27],
    [110, -330, 31],
    [210, -360, 34],
    [320, -330, 36],
    [380, -400, 38],
    [300, -470, 36],
    [120, -460, 30],
    [-40, -400, 22],
    [-120, -300, 14],
    [-110, -170, 8],
    [-90, -60, 3],
  ],
  width: 12,
  runoff: 5,
  banking: 0.9,
  checkpointCount: 9,
  seed: 31415926,
  night: false,
  medals: { gold: 65_500, silver: 73_500, bronze: 89_500 },
  scenery: [
    { kind: 'pine', count: 260, minDistance: 4, maxDistance: 130, scaleMin: 0.8, scaleMax: 1.6 },
    { kind: 'rock', count: 140, minDistance: 2, maxDistance: 120, scaleMin: 0.8, scaleMax: 2.4 },
  ],
  lampSpacing: 0,
  palette: {
    skyTop: 0x2b2f6b,
    skyHorizon: 0xff9a66,
    skyBottom: 0xd9735a,
    fog: 0xd98f74,
    fogNear: 110,
    fogFar: 800,
    ground: 0x6c8a45,
    groundDetail: 0x5a7839,
    asphalt: 0x45434c,
    asphaltDetail: 0x55525c,
    line: 0xf6efe2,
    curbA: 0xe0a21f,
    curbB: 0x2a2833,
    barrierA: 0xc8432e,
    barrierB: 0xf6efe2,
    sunColor: 0xffa66b,
    sunIntensity: 2.3,
    sunDirection: [0.7, 0.28, 0.35],
    hemiSky: 0xffc2a6,
    hemiGround: 0x4f5a34,
    hemiIntensity: 1.05,
    foliage: [0x2f5e34, 0x3a6c38, 0x46773b],
    rock: 0x8b7f7a,
    facades: [0xcdb9a0],
    lights: [0xffe0a8],
  },
};

export const PUERTO_NEON: TrackDef = {
  id: 'puerto-neon',
  name: 'Puerto Neón',
  description: 'Noche en el puerto. Calles estrechas y esquinas en ángulo.',
  points: [
    [0, 0, 0],
    [220, 0, 0],
    [250, -30, 0],
    [250, -160, 2],
    [220, -190, 3],
    [120, -190, 3],
    [95, -215, 2],
    [95, -300, 0],
    [65, -330, 0],
    [-120, -330, 0],
    [-150, -300, 0],
    [-150, -200, 1],
    [-120, -170, 1],
    [-70, -140, 0],
    [-70, -60, 0],
    [-40, -25, 0],
  ],
  width: 10,
  runoff: 3.5,
  banking: 0,
  checkpointCount: 8,
  seed: 27182818,
  night: true,
  medals: { gold: 53_000, silver: 60_500, bronze: 75_000 },
  scenery: [
    { kind: 'building', count: 190, minDistance: 3, maxDistance: 70, scaleMin: 0.8, scaleMax: 1.5 },
  ],
  lampSpacing: 36,
  palette: {
    skyTop: 0x050817,
    skyHorizon: 0x2a2459,
    skyBottom: 0x16163a,
    fog: 0x1b1a40,
    fogNear: 70,
    fogFar: 560,
    ground: 0x3a4150,
    groundDetail: 0x444c5c,
    asphalt: 0x34363f,
    asphaltDetail: 0x40424c,
    line: 0xeceaff,
    curbA: 0xff4fae,
    curbB: 0x2ee6e8,
    barrierA: 0x7d48ff,
    barrierB: 0xe9e6ff,
    sunColor: 0xa9bcff,
    sunIntensity: 1.1,
    sunDirection: [0.3, 0.7, -0.4],
    hemiSky: 0x7f8cd8,
    hemiGround: 0x2a2840,
    hemiIntensity: 1.5,
    foliage: [0x2c5a46],
    rock: 0x5c5f6b,
    facades: [0x2d3350, 0x3b2f52, 0x24404f, 0x46334a],
    lights: [0xff5fb8, 0x46f0ff, 0xffd166, 0xb48cff],
  },
};

export const TRACKS: readonly TrackDef[] = [VALLE_SOLAR, CUMBRE, PUERTO_NEON];

export function trackById(id: string): TrackDef | null {
  return TRACKS.find((t) => t.id === id) ?? null;
}
