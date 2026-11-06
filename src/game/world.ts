import { createControls, resetControls, type CarControls } from '../core/input';
import { vec2 } from '../core/math';
import { RACE, STEP_SECONDS } from '../data/balance';
import type { CarDef, CarParams } from '../data/cars';
import { copyCarState, createCarState, placeCar, type CarState } from './car';
import { GhostRecorder, type GhostData } from './ghost';
import { createRaceState, type RaceState } from './race';
import { countdownSystem } from './systems/countdown';
import { ghostRecordSystem } from './systems/ghost-record';
import { carPhysicsSystem } from './systems/car-physics';
import { raceSystem } from './systems/race-progress';
import { respawnSystem } from './systems/respawn';
import { trackContactSystem } from './systems/track-contact';
import { createTrackQuery, type Track, type TrackQuery } from './track';

/** Entrada de un paso de simulación. */
export interface StepInput {
  controls: CarControls;
  /** Pulsación de reaparecer en este paso. */
  respawn: boolean;
}

export type System = (world: World, input: StepInput, dt: number) => void;

/**
 * Orden fijo de los sistemas en cada paso. Cada sistema tiene una sola responsabilidad:
 * 1. cuenta atrás, 2. reaparición, 3. física del coche, 4. contacto con la pista, 5. vueltas y contramano,
 * 6. grabación del fantasma.
 */
export const SYSTEMS: readonly System[] = [
  countdownSystem,
  respawnSystem,
  carPhysicsSystem,
  trackContactSystem,
  raceSystem,
  ghostRecordSystem,
];

/** Estado completo de una partida de contrarreloj. No conoce el render ni el DOM. */
export class World {
  readonly car: CarState = createCarState();
  /** Copia del coche al principio del paso, para que el render interpole. */
  readonly previousCar: CarState = createCarState();
  readonly query: TrackQuery = createTrackQuery();
  /** Parámetros de física en uso (copia editable desde el panel de depuración). */
  readonly params: CarParams;
  race: RaceState;
  /** Contador de teletransportes (reaparición, reinicio): el render no interpola a través de ellos. */
  teleports = 0;
  /** Controles efectivos aplicados en el último paso. */
  readonly appliedControls: CarControls = createControls();
  /** true en el paso en que se completó una vuelta. */
  lapCompletedThisStep = false;
  /** Grabación de la vuelta en curso. */
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
  ) {
    this.params = { ...carDef.params };
    this.race = createRaceState(initialBestLapMs);
    this.reset(initialBestLapMs);
  }

  /** Vuelve a la parrilla y reinicia la carrera conservando la mejor vuelta conocida. */
  reset(bestLapMs: number | null = this.race.bestLapMs ?? this.initialBestLapMs): void {
    this.race = createRaceState(bestLapMs);
    this.placeAt(RACE.startOffset);
    resetControls(this.appliedControls);
    this.recorder.stop();
    this.lapCompletedThisStep = false;
  }

  /** Coloca el coche parado en el centro de la pista en un progreso dado. */
  placeAt(progress: number): void {
    this.track.pointAt(progress, this.tmpPos, this.tmpTangent);
    placeCar(
      this.car,
      this.tmpPos.x,
      this.tmpPos.z,
      Math.atan2(-this.tmpTangent.z, this.tmpTangent.x),
    );
    this.track.query(this.car.x, this.car.z, this.query);
    this.car.surface = this.query.surface;
    this.race.progress = this.query.progress;
    copyCarState(this.previousCar, this.car);
    this.teleports++;
  }

  step(input: StepInput): void {
    copyCarState(this.previousCar, this.car);
    this.lapCompletedThisStep = false;
    for (const system of SYSTEMS) system(this, input, STEP_SECONDS);
  }
}
