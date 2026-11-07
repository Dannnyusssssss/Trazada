import { createControls, type CarControls } from '../core/input';
import type { CarDef, CarParams } from '../data/cars';
import { createCarState, type CarState } from './car';
import { createRaceState, type RaceState } from './race';
import { createTrackQuery, type TrackQuery } from './track';

export type RacerKind = 'player' | 'ai';

/**
 * Un coche en la carrera: su estado físico, su progreso en la carrera y quién lo conduce.
 * El jugador y los rivales usan exactamente la misma estructura y la misma física.
 */
export interface Racer {
  readonly index: number;
  readonly kind: RacerKind;
  readonly carDef: CarDef;
  /** Parámetros de física en uso (copia editable desde el panel de depuración). */
  readonly params: CarParams;
  /** Nombre que se muestra en posiciones y resultados. */
  readonly name: string;
  readonly bodyColor: number;
  readonly car: CarState;
  /** Copia del coche al principio del paso, para que el render interpole. */
  readonly previousCar: CarState;
  readonly query: TrackQuery;
  /** Controles efectivos aplicados en el último paso. */
  readonly controls: CarControls;
  race: RaceState;
  /** Contador de teletransportes (reaparición, reinicio): el render no interpola a través de ellos. */
  teleports: number;
  /** true en el paso en que este coche completó una vuelta. */
  lapCompletedThisStep: boolean;
  /** Pasos seguidos casi parado durante la carrera (para la reaparición automática). */
  stuckSteps: number;
  /** Tras reaparecer no choca con otros coches hasta quedar libre (para no aparecer encima de nadie). */
  noCollide: boolean;
  /** Velocidad de cierre del último choque con otro coche (m/s); 0 si no hubo choque en este paso. */
  carImpact: number;
  /** Posición de salida: progreso por delante de la meta (m) y desplazamiento lateral (m). */
  gridProgress: number;
  gridLateral: number;
}

export interface RacerSetup {
  index: number;
  kind: RacerKind;
  carDef: CarDef;
  name: string;
  bodyColor: number;
  gridProgress: number;
  gridLateral: number;
  bestLapMs: number | null;
  totalLaps: number;
}

export function createRacer(setup: RacerSetup): Racer {
  return {
    index: setup.index,
    kind: setup.kind,
    carDef: setup.carDef,
    params: { ...setup.carDef.params },
    name: setup.name,
    bodyColor: setup.bodyColor,
    car: createCarState(),
    previousCar: createCarState(),
    query: createTrackQuery(),
    controls: createControls(),
    race: createRaceState(setup.bestLapMs, setup.totalLaps),
    teleports: 0,
    lapCompletedThisStep: false,
    stuckSteps: 0,
    noCollide: false,
    carImpact: 0,
    gridProgress: setup.gridProgress,
    gridLateral: setup.gridLateral,
  };
}

/**
 * Distancia total recorrida en la carrera (m): vueltas completadas más lo recorrido de la vuelta en curso.
 * Sirve para ordenar las posiciones.
 */
export function raceDistance(racer: Racer, trackLength: number): number {
  return racer.race.lapsCompleted * trackLength + racer.race.lapDistance;
}
