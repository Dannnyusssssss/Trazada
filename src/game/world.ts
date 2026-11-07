import { resetControls, type CarControls } from '../core/input';
import { vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { AI, GRID, RACE, STEP_SECONDS, type Difficulty } from '../data/balance';
import { carById, type CarDef, type CarParams } from '../data/cars';
import { RIVALS } from '../data/rivals';
import { AiDriver } from './ai';
import { copyCarState, placeCar, type CarState } from './car';
import { GhostRecorder, type GhostData } from './ghost';
import { createRaceState, type RaceState } from './race';
import { createRacer, raceDistance, type Racer } from './racer';
import { carCollisionSystem } from './systems/car-collision';
import { carPhysicsSystem } from './systems/car-physics';
import { controlSystem } from './systems/controls';
import { countdownSystem } from './systems/countdown';
import { ghostRecordSystem } from './systems/ghost-record';
import { raceSystem } from './systems/race-progress';
import { respawnSystem } from './systems/respawn';
import { trackContactSystem } from './systems/track-contact';
import type { Track, TrackQuery } from './track';
import {
  createAssistState,
  defaultAssists,
  type AssistSettings,
  type AssistState,
} from './assists';

/** Entrada de un paso de simulación (la del jugador). */
export interface StepInput {
  controls: CarControls;
  /** Pulsación de reaparecer en este paso. */
  respawn: boolean;
}

export type System = (world: World, input: StepInput, dt: number) => void;

/** Contrarreloj (un solo coche, con fantasma) o carrera contra rivales. */
export type GameMode = 'timeTrial' | 'race';

export interface WorldOptions {
  mode?: GameMode;
  difficulty?: Difficulty;
  /** Semilla de las variaciones de los rivales. */
  seed?: number;
}

/**
 * Semilla de una carrera a partir del circuito, la dificultad y el número de intento: cada carrera es un poco
 * distinta, pero la misma combinación da siempre los mismos rivales (determinismo).
 */
export function raceSeed(trackId: string, difficulty: Difficulty, attempt: number): number {
  // Hash FNV-1a de 32 bits del texto.
  let hash = 0x811c9dc5;
  const text = `${trackId}|${difficulty}|${attempt}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Orden fijo de los sistemas en cada paso. Cada sistema tiene una sola responsabilidad:
 * 1. cuenta atrás, 2. reaparición (tecla R y coches atascados), 3. controles (jugador, asistencias y
 * rivales), 4. física de los coches, 5. colisión entre coches, 6. contacto con la pista,
 * 7. vueltas, contramano y posiciones, 8. grabación del fantasma.
 */
export const SYSTEMS: readonly System[] = [
  countdownSystem,
  respawnSystem,
  controlSystem,
  carPhysicsSystem,
  carCollisionSystem,
  trackContactSystem,
  raceSystem,
  ghostRecordSystem,
];

/**
 * Estado completo de una partida: el coche del jugador y, en el modo Carrera, los rivales.
 * No conoce el render ni el DOM. Los accesos `car`, `race`, `query`, etc. son los del jugador.
 */
export class World {
  readonly mode: GameMode;
  readonly difficulty: Difficulty;
  readonly seed: number;
  /** Todos los coches; el jugador es siempre el primero. */
  readonly racers: Racer[] = [];
  readonly player: Racer;
  /** Conductor de cada coche (null para el jugador). */
  readonly drivers: (AiDriver | null)[] = [];
  /** Índices de los coches ordenados por posición (el primero va en cabeza). */
  readonly order: number[] = [];
  /** Asistencias de conducción del jugador (las fija quien crea el mundo, desde los ajustes). */
  assists: AssistSettings = defaultAssists();
  readonly assistState: AssistState = createAssistState();
  /** Grabación de la vuelta en curso (solo contrarreloj). */
  readonly recorder = new GhostRecorder();
  /** Última vuelta grabada completa (la recoge quien decide si guardarla). */
  lastGhost: GhostData | null = null;
  /** Aumenta cada vez que hay una vuelta grabada nueva en lastGhost. */
  ghostVersion = 0;
  private readonly tmpPos = vec2();
  private readonly tmpTangent = vec2();

  constructor(
    readonly track: Track,
    readonly carDef: CarDef,
    private readonly initialBestLapMs: number | null,
    options: WorldOptions = {},
  ) {
    this.mode = options.mode ?? 'timeTrial';
    this.difficulty = options.difficulty ?? 'normal';
    this.seed = options.seed ?? 1;
    const race = this.mode === 'race';
    const totalLaps = race ? RACE.raceLaps : RACE.timeTrialLaps;

    // El jugador sale el último de la parrilla en Carrera; en contrarreloj, centrado tras la meta.
    const lastSlot = GRID.slots - 1;
    this.player = createRacer({
      index: 0,
      kind: 'player',
      carDef,
      name: carDef.name,
      bodyColor: carDef.bodyColor,
      gridProgress: RACE.startOffset,
      gridLateral: race ? World.slotLateral(lastSlot) : 0,
      bestLapMs: initialBestLapMs,
      totalLaps,
    });
    this.racers.push(this.player);
    this.drivers.push(null);

    if (race) {
      const rng = new Rng(this.seed);
      const level = AI.levels[this.difficulty];
      RIVALS.slice(0, GRID.slots - 1).forEach((rival, slot) => {
        const def = carById(rival.carId) ?? carDef;
        const racer = createRacer({
          index: this.racers.length,
          kind: 'ai',
          carDef: def,
          name: `${def.name} ${rival.colorName}`,
          bodyColor: rival.bodyColor,
          gridProgress: RACE.startOffset + (lastSlot - slot) * GRID.slotSpacing,
          gridLateral: World.slotLateral(slot),
          bestLapMs: null,
          totalLaps,
        });
        this.racers.push(racer);
        this.drivers.push(new AiDriver(track, racer, level, rng));
      });
    }
    this.reset(initialBestLapMs);
  }

  /** Columna de una posición de salida: las pares a la izquierda y las impares a la derecha. */
  private static slotLateral(slot: number): number {
    return slot % 2 === 0 ? GRID.lateral : -GRID.lateral;
  }

  // Accesos al coche del jugador (los usan el render, el HUD y la contrarreloj).
  get car(): CarState {
    return this.player.car;
  }
  get previousCar(): CarState {
    return this.player.previousCar;
  }
  get query(): TrackQuery {
    return this.player.query;
  }
  get params(): CarParams {
    return this.player.params;
  }
  get race(): RaceState {
    return this.player.race;
  }
  get appliedControls(): CarControls {
    return this.player.controls;
  }
  get teleports(): number {
    return this.player.teleports;
  }
  get lapCompletedThisStep(): boolean {
    return this.player.lapCompletedThisStep;
  }

  /** Vuelve a la parrilla y reinicia la carrera conservando la mejor vuelta conocida. */
  reset(bestLapMs: number | null = this.player.race.bestLapMs ?? this.initialBestLapMs): void {
    const totalLaps = this.mode === 'race' ? RACE.raceLaps : RACE.timeTrialLaps;
    this.order.length = 0;
    for (const racer of this.racers) {
      racer.race = createRaceState(racer === this.player ? bestLapMs : null, totalLaps);
      this.placeRacer(racer, racer.gridProgress, racer.gridLateral);
      racer.race.lapDistance = racer.gridProgress;
      resetControls(racer.controls);
      racer.lapCompletedThisStep = false;
      racer.stuckSteps = 0;
      racer.noCollide = false;
      racer.carImpact = 0;
      this.order.push(racer.index);
    }
    for (const driver of this.drivers) driver?.reset();
    this.recorder.stop();
  }

  /** Coloca un coche parado en un progreso de la pista, desplazado lateralmente (positivo a la izquierda). */
  placeRacer(racer: Racer, progress: number, lateral = 0): void {
    this.track.pointAt(progress, this.tmpPos, this.tmpTangent);
    const tx = this.tmpTangent.x;
    const tz = this.tmpTangent.z;
    // Normal izquierda de la pista: (tz, -tx).
    placeCar(
      racer.car,
      this.tmpPos.x + tz * lateral,
      this.tmpPos.z - tx * lateral,
      Math.atan2(-tz, tx),
    );
    this.track.query(racer.car.x, racer.car.z, racer.query);
    racer.car.surface = racer.query.surface;
    racer.race.progress = racer.query.progress;
    copyCarState(racer.previousCar, racer.car);
    racer.teleports++;
  }

  /** Coloca el coche del jugador parado en el centro de la pista en un progreso dado. */
  placeAt(progress: number): void {
    this.placeRacer(this.player, progress, 0);
  }

  /** Posición en carrera de un coche (1 = primero). */
  positionOf(racer: Racer): number {
    return this.order.indexOf(racer.index) + 1;
  }

  /**
   * Recalcula el orden de carrera: primero los que ya terminaron, por orden de llegada; después el resto,
   * por distancia recorrida. Usa inserción sobre el arreglo existente (sin crear objetos).
   */
  updateOrder(): void {
    const order = this.order;
    const length = this.track.length;
    const ahead = (a: Racer, b: Racer): boolean => {
      const af = a.race.phase === 'finished';
      const bf = b.race.phase === 'finished';
      if (af !== bf) return af;
      if (af) return a.race.raceSteps < b.race.raceSteps;
      return raceDistance(a, length) > raceDistance(b, length);
    };
    for (let i = 1; i < order.length; i++) {
      const current = order[i] ?? 0;
      const racer = this.racers[current];
      if (!racer) continue;
      let j = i - 1;
      while (j >= 0) {
        const other = this.racers[order[j] ?? 0];
        if (!other || !ahead(racer, other)) break;
        order[j + 1] = order[j] ?? 0;
        j--;
      }
      order[j + 1] = current;
    }
  }

  step(input: StepInput): void {
    for (const racer of this.racers) {
      copyCarState(racer.previousCar, racer.car);
      racer.lapCompletedThisStep = false;
      racer.carImpact = 0;
    }
    for (const system of SYSTEMS) system(this, input, STEP_SECONDS);
  }
}
