/**
 * Balance global del juego: simulación, pista, superficies, muros, carrera, cámara y ajustes.
 * Todos los números de diseño viven aquí o en cars.ts / tracks.ts.
 */

export const SIM = {
  /** Frecuencia de la lógica (pasos por segundo). */
  hz: 60,
  /** Tope de pasos por frame de render. */
  maxStepsPerFrame: 5,
  /** Tope de tiempo por frame (s): al volver de otra pestaña no se simula de golpe. */
  maxFrameSeconds: 0.25,
} as const;

export const STEP_SECONDS = 1 / SIM.hz;

export const TRACK = {
  /** Separación objetivo entre muestras de la línea central (m). */
  sampleSpacing: 1,
  /** Sub-muestras por segmento de la spline al calcular la longitud del arco. */
  splineSubdivisions: 64,
  /** Ancho del piano (m), por dentro del borde del asfalto. */
  curbWidth: 1.3,
  /** Curvatura (1/m) a partir de la cual el borde lleva piano. 1/75 equivale a un radio de 75 m. */
  curbCurvature: 1 / 75,
  /** Muestras de margen que se extiende el piano antes y después de la curva. */
  curbPadding: 6,
  /** Franja de césped mínima entre el borde del asfalto y el muro (m); cada circuito define la suya. */
  minRunoff: 2.5,
  /** Tamaño de la celda de la rejilla espacial para la consulta de punto más cercano (m). */
  gridCellSize: 16,
  /** Radio mínimo de curvatura permitido en los datos de un circuito (m). */
  minCurveRadius: 18,
  /** Ancho mínimo permitido (m). */
  minWidth: 9,
  /** Radio (en muestras) del suavizado de la altura. */
  heightSmoothing: 12,
  /** Pendiente longitudinal máxima permitida (0.09 = 9 %). */
  maxGrade: 0.09,
  /** Peralte: pendiente lateral por unidad de curvatura, antes del factor de cada circuito. */
  bankPerCurvature: 4.2,
  /** Peralte máximo como pendiente lateral (tan 6° ≈ 0.105). */
  maxBank: 0.105,
  /** Radio (en muestras) del suavizado del peralte. */
  bankSmoothing: 15,
} as const;

/** Terreno alrededor de la pista (solo visual). */
export const TERRAIN = {
  /** El terreno queda por debajo de la superficie de la pista bajo los muros (m). */
  belowTrack: 0.35,
  /** Distancia desde el muro en la que el terreno pasa de la altura de la pista a la del entorno (m). */
  blendDistance: 70,
  /** Margen del terreno detallado alrededor del circuito (m). */
  margin: 130,
  /** Separación entre vértices del terreno detallado (m). */
  cellSize: 6,
} as const;

/** Efecto de cada superficie sobre el coche. */
export interface SurfaceEffect {
  /** Multiplica el agarre lateral. */
  grip: number;
  /** Multiplica la velocidad máxima que puede alcanzar el motor. */
  engine: number;
  /** Resistencia adicional proporcional a la velocidad (1/s). */
  drag: number;
}

export type Surface = 'asphalt' | 'curb' | 'grass';

export const SURFACES: Readonly<Record<Surface, SurfaceEffect>> = {
  asphalt: { grip: 1, engine: 1, drag: 0 },
  curb: { grip: 0.9, engine: 0.97, drag: 0.04 },
  grass: { grip: 0.55, engine: 0.5, drag: 0.45 },
};

export const WALL = {
  /** Fracción de la velocidad hacia el muro que rebota (0 = sin rebote). */
  restitution: 0.2,
  /** Pérdida de velocidad paralela al muro en proporción al golpe. */
  friction: 0.2,
  /** Rapidez (1/s) con la que el coche se alinea con la pista al rozar el muro. */
  alignRate: 7,
} as const;

export const RACE = {
  /** Duración de la cuenta atrás (s). */
  countdownSeconds: 3,
  /** Tiempo que se muestra "¡YA!" tras la salida (s). */
  goSeconds: 1,
  /** Distancia por delante de la meta donde arranca el coche (m). */
  startOffset: 6,
  /** Distancia por delante del checkpoint donde reaparece el coche (m). */
  respawnOffset: 2,
  /** Velocidad mínima para considerar que se circula en contramano (m/s). */
  wrongWayMinSpeed: 3,
  /** Coseno máximo entre el rumbo y la pista para considerar contramano (más de ~110°). */
  wrongWayCos: -0.35,
  /** Tiempo sostenido para mostrar el aviso de contramano (s). */
  wrongWayShowSeconds: 1,
  /** Tiempo sostenido en sentido correcto para quitar el aviso (s). */
  wrongWayClearSeconds: 0.5,
  /** Tiempo de vuelta válido (ms) para aceptar un récord leído del guardado. */
  minLapMs: 5_000,
  maxLapMs: 3_600_000,
  /** Vueltas de una sesión de contrarreloj; al terminarlas se muestran los resultados. */
  timeTrialLaps: 3,
} as const;

export const CAMERA = {
  /** Distancia detrás del coche (m). */
  distance: 7.5,
  /** Altura sobre el suelo (m). */
  height: 3.1,
  /** Punto al que mira, por delante del coche (m). */
  lookAhead: 5,
  lookHeight: 1.1,
  /** Rapidez del suavizado de posición y de rumbo (1/s). */
  positionRate: 7,
  headingRate: 4.5,
  /** Con "Reducir movimiento" la cámara va más pegada al coche: menos balanceo y menos retardo. */
  reducedPositionRate: 16,
  reducedHeadingRate: 12,
  /** Campo de visión vertical base (grados): valor inicial y rango del ajuste. */
  fovDefault: 70,
  fovMin: 55,
  fovMax: 90,
  /** Cámara alta (tecla C): más lejos y más arriba. */
  highDistance: 13,
  highHeight: 8,
  highLookAhead: 9,
  /** Rapidez de la transición entre cámaras (1/s). */
  switchRate: 4,
} as const;

export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Tope de devicePixelRatio. */
  maxPixelRatio: number;
  /** Fracción del escenario que se dibuja. */
  sceneryDensity: number;
  /** Sombras de la luz del sol (solo en Alta). */
  shadows: boolean;
  /** Tamaño del mapa de sombras (px). */
  shadowMapSize: number;
  /** Filtrado anisótropo máximo de las texturas. */
  anisotropy: number;
}

export const QUALITY: Readonly<Record<Quality, QualityPreset>> = {
  low: { maxPixelRatio: 1, sceneryDensity: 0.5, shadows: false, shadowMapSize: 0, anisotropy: 2 },
  medium: {
    maxPixelRatio: 1.5,
    sceneryDensity: 1,
    shadows: false,
    shadowMapSize: 0,
    anisotropy: 4,
  },
  high: { maxPixelRatio: 2, sceneryDensity: 1, shadows: true, shadowMapSize: 2048, anisotropy: 8 },
};

export const RENDER = {
  /** Lado de la zona con sombras alrededor del coche (m), solo en calidad Alta. */
  shadowArea: 90,
} as const;

export const HUD = {
  /** Tiempo que se muestra el aviso de vuelta completada (s). */
  lapMessageSeconds: 3,
  /** Distancia recorrida en la vuelta antes de mostrar la diferencia con el fantasma (m). */
  ghostDeltaMinDistance: 25,
  /** Tamaño del minimapa en píxeles CSS. */
  minimapSize: 170,
} as const;

export const GHOST = {
  /** Muestras por segundo de la grabación. */
  hz: 20,
  /** Duración máxima de una vuelta grabada (s). */
  maxSeconds: 240,
  /** Cuantización: centímetros para la posición y diezmilésimas de radián para el rumbo. */
  positionScale: 100,
  headingScale: 10_000,
  /** Opacidad del coche fantasma. */
  opacity: 0.38,
  /** Distancia máxima a la pista de una muestra válida (m), además de la distancia al muro. */
  trackTolerance: 3,
} as const;
