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
  /** Vueltas de una carrera contra rivales. */
  raceLaps: 3,
  /** Por debajo de esta velocidad (m/s), intentando moverse, el coche se considera atascado. */
  stuckSpeed: 1,
  /** Tiempo atascado tras el que un rival reaparece solo (s). */
  aiStuckSeconds: 3,
} as const;

/** Parrilla de salida del modo Carrera: dos columnas escalonadas por delante de la meta. */
export const GRID = {
  /** Coches en la parrilla (el jugador y 5 rivales). */
  slots: 6,
  /** Distancia a lo largo de la pista entre una posición de salida y la siguiente (m). */
  slotSpacing: 5,
  /** Desplazamiento lateral de cada columna respecto al centro (m). */
  lateral: 2.4,
} as const;

/** Colisión entre coches: dos círculos por coche (morro y cola) y un empujón suave, sin daño. */
export const CAR_COLLISION = {
  /** Distancia de cada círculo al centro del coche, hacia delante y hacia atrás (m). */
  circleOffset: 1.05,
  /** Fracción de la velocidad de cierre que rebota. */
  restitution: 0.15,
} as const;

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/**
 * Parámetros de conducción de los rivales en una dificultad. No cambian la física del coche: solo lo cerca
 * del límite que conducen.
 */
export interface AiLevel {
  /**
   * Ritmo objetivo como mezcla de los tiempos de medalla del circuito: tiempo de vuelta =
   * oro·gold + plata·silver + bronce·bronze. De ahí sale la aceleración lateral que se permiten en curva.
   */
  pace: { readonly gold: number; readonly silver: number; readonly bronze: number };
  /** Fracción del freno del coche que usan al planificar la frenada. */
  brakeUse: number;
  /** Variación (±, en fracción) del ritmo entre rivales, según la semilla. */
  spread: number;
}

/** Inteligencia de los rivales. Conducen con los mismos controles y la misma física que el jugador. */
export const AI = {
  levels: {
    // Fácil: entre la plata y el bronce. Normal: la plata. Difícil: un 2 % más lento que el oro.
    easy: { pace: { gold: 0, silver: 0.5, bronze: 0.5 }, brakeUse: 0.6, spread: 0.03 },
    normal: { pace: { gold: 0, silver: 1, bronze: 0 }, brakeUse: 0.7, spread: 0.025 },
    hard: { pace: { gold: 1.02, silver: 0, bronze: 0 }, brakeUse: 0.8, spread: 0.015 },
  } satisfies Record<Difficulty, AiLevel>,
  /**
   * Relación medida entre el tiempo real de vuelta de un rival y el estimado con su perfil (la dirección y
   * el tráfico hacen perder algo): el ritmo pedido se divide por ella.
   */
  paceCorrection: 1,
  /** Ayuda limitada: ajuste máximo (±) de la aceleración lateral según la distancia al jugador. */
  rubberBand: 0.04,
  /** Distancia al jugador (m) a la que el ajuste es completo. */
  rubberBandGap: 150,
  /** Distancia de seguimiento de la línea: fija más una parte proporcional a la velocidad (m, s). */
  lookAhead: 8,
  lookAheadPerSpeed: 0.35,
  /** Ganancia de la dirección sobre el error de rumbo. */
  steerGain: 2.5,
  /** Margen entre la línea de carrera y el borde del asfalto (m). */
  lineMargin: 1.6,
  /** Margen mínimo entre el centro del coche y el borde del asfalto al esquivar (m). */
  edgeMargin: 1.2,
  /** Desplazamiento lateral máximo (±) propio de cada rival respecto a la línea (m). */
  lineBias: 0.7,
  /** Anticipación con la que miran la velocidad objetivo (s). */
  speedPreview: 0.25,
  /** Margen de velocidad por encima del objetivo antes de frenar (m/s). */
  brakeMargin: 1.5,
  /** Un coche por delante a menos de esta distancia (m) y de este ancho (m) obliga a apartarse. */
  avoidDistance: 16,
  avoidWidth: 2.6,
  /** Distancia a lo largo de la pista (±, m) en la que otro coche se considera "al lado". */
  alongside: 5,
  /** Separación lateral mínima que se deja con un coche que va al lado (m, de centro a centro). */
  sideGap: 2.5,
  /** Cuánto se aparta lateralmente para adelantar (m). */
  avoidShift: 2.8,
  /** Rapidez con la que cambia el desplazamiento lateral para adelantar (m/s). */
  avoidRate: 2.5,
} as const;

/** Asistencias de conducción del jugador (opcionales y guardadas en los ajustes). */
export const ASSISTS = {
  /** Ayuda de dirección: rapidez máxima con la que cambia la dirección pedida (1/s). */
  steerSlew: 3.2,
  /** Ayuda de dirección: fracción de la dirección que se quita a velocidad máxima. */
  steerHighSpeedCut: 0.3,
  /** Ayuda de frenado: aceleración lateral prudente y fracción del freno con las que se calcula el aviso. */
  brakeLateralAccel: 12,
  brakeUse: 0.75,
  /** Por encima de la velocidad prudente más este margen (m/s) se suelta el acelerador. */
  brakeLiftMargin: 1,
  /** Por encima de la velocidad prudente más este margen (m/s) se frena. */
  brakeMargin: 3,
  /** Tiempo atascado tras el que el coche del jugador reaparece solo, si la ayuda está activa (s). */
  stuckSeconds: 4,
} as const;

/**
 * Efectos visuales: luces, humo, chispas, marcas de derrape y cámara. Ningún efecto destella más de
 * 3 veces por segundo. Con "Reducir movimiento" se apagan la sacudida, el campo de visión variable,
 * el humo y las chispas.
 */
export const EFFECTS = {
  /** Brillo de los faros de día y de noche, y de los pilotos traseros en reposo y al frenar. */
  headlightDay: 0.35,
  headlightNight: 1.4,
  taillightIdle: 0.25,
  taillightBrake: 1.7,
  /**
   * Luces de freno: una vez encendidas quedan al menos este tiempo (s) y cambian con un fundido (1/s).
   * Así, aunque se pulse el freno muy rápido, no pasan de unos 2 encendidos por segundo.
   */
  brakeLightMinOn: 0.4,
  brakeLightFadeRate: 8,
  /** Haz de los faros sobre el asfalto en circuitos nocturnos (m y opacidad). */
  beamWidth: 5,
  beamLength: 14,
  beamOpacity: 0.42,
  /** Deslizamiento lateral (m/s) a partir del cual hay derrape, y con el que es máximo. */
  skidMinSlip: 3,
  skidFullSlip: 9,
  /** Con el freno de mano a más de esta velocidad (m/s) también se considera derrape. */
  handbrakeSkidSpeed: 8,
  /** Humo: partículas en el grupo, vida (s), emisión por segundo y por coche con derrape máximo. */
  smokeCount: 256,
  smokeLife: 1.2,
  smokeRate: 26,
  /** Opacidad del humo y tamaño base de cada bocanada (escala de una esfera de 1 m). */
  smokeOpacity: 0.2,
  smokeSize: 0.8,
  /** Chispas: partículas en el grupo, vida (s), chispas por ráfaga y golpe mínimo (m/s). */
  sparkCount: 128,
  sparkLife: 0.35,
  sparkBurst: 10,
  sparkMinImpact: 3,
  /** Tiempo mínimo entre dos ráfagas de chispas en todo el juego (s): tope de destellos. */
  sparkInterval: 0.4,
  /** Marcas de derrape: tramos en el búfer circular, largo mínimo de un tramo (m), ancho y opacidad. */
  skidMarkCount: 600,
  skidMarkSegment: 0.7,
  skidMarkWidth: 0.28,
  skidMarkOpacity: 0.38,
  /** Altura de las marcas sobre la superficie de la pista (por encima del asfalto y por debajo del piano). */
  skidMarkLift: 0.055,
  /** Distancia máxima a la cámara a la que un coche genera humo, chispas y marcas (m). */
  maxDistance: 140,
  /** Aumento máximo del campo de visión con la velocidad (grados) y rapidez de su suavizado (1/s). */
  fovBoost: 7,
  fovRate: 2.5,
  /** Sacudida de cámara: amplitud por velocidad (a velocidad máxima) y por golpe (m), y su caída (1/s). */
  shakeSpeed: 0.025,
  shakeImpact: 0.09,
  shakeImpactPerSpeed: 0.012,
  shakeDecay: 5,
} as const;

/** Sonido sintetizado: niveles de la mezcla y valores por defecto. */
export const AUDIO = {
  /** Volumen general por defecto (0–100). */
  defaultVolume: 60,
  /** Ganancia de la mezcla a volumen 100: moderada, para no asustar. */
  masterGain: 0.5,
  /** Caja de cambios simulada: fin de cada marcha como fracción de la velocidad máxima. */
  gearTops: [0.2, 0.38, 0.56, 0.76, 1] as readonly number[],
  /** Sube de marcha al llegar a esta fracción del final de la marcha; baja por debajo de esta del anterior. */
  upshiftAt: 0.97,
  downshiftAt: 0.85,
  /** RPM normalizadas al ralentí. */
  rpmIdle: 0.18,
  /** Frecuencia del motor al ralentí y al corte (Hz): por encima de ~70 Hz para altavoces de portátil. */
  engineMinHz: 78,
  engineMaxHz: 215,
  /** Corte del filtro del motor (Hz): cerrado al ralentí, abierto con RPM y carga. */
  engineMinCutoff: 450,
  engineMaxCutoff: 3200,
  /** Volumen del motor al ralentí (fracción del máximo). */
  engineIdleGain: 0.35,
  /** Niveles de cada parte de la mezcla (antes del volumen general). */
  engineLevel: 0.32,
  rivalEngineLevel: 0.16,
  skidLevel: 0.18,
  windLevel: 0.12,
  impactLevel: 0.4,
  cueLevel: 0.22,
  musicLevel: 0.11,
  /** Distancia (m) a la que deja de oírse un motor rival, y anchura máxima de su panorámica. */
  rivalRange: 70,
  rivalPan: 0.8,
  /** Golpes: velocidad mínima que suena y con la que el golpe suena al máximo (m/s). */
  impactMinSpeed: 1.5,
  impactFullSpeed: 12,
  /** Tiempo mínimo entre dos golpes (s), para que un roce largo no sea un traqueteo. */
  impactInterval: 0.15,
  /** Música: tempo y probabilidad de nota de la melodía en cada corchea. */
  musicBpm: 96,
  musicLeadDensity: 0.45,
} as const;

/** Línea de carrera precalculada por circuito. */
export const RACING_LINE = {
  /** Pasadas de relajación de la curvatura y separación (en muestras) de cada escala. */
  passes: [
    [40, 60],
    [20, 80],
    [8, 80],
  ] as readonly (readonly [number, number])[],
  /** Suavizado final del desplazamiento: radio (muestras) y número de pasadas. */
  smoothRadius: 8,
  smoothPasses: 3,
  /** Velocidad mínima del perfil (m/s), para que nadie se pare en una curva. */
  minSpeed: 12,
  /** Rango de búsqueda de la aceleración lateral al ajustar el ritmo de un rival (m/s²). */
  minLateralAccel: 3,
  maxLateralAccel: 30,
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
