import { mod } from '../core/math';
import { RACE, SIM } from '../data/balance';
import type { CarState } from './car';
import type { Track, TrackQuery } from './track';
import { progressDelta } from './track';

export type RacePhase = 'countdown' | 'racing';

/**
 * Estado de la contrarreloj: cuenta atrás, checkpoints en orden, vueltas, tiempos y aviso de contramano.
 * Todo el tiempo se cuenta en pasos fijos de simulación.
 */
export interface RaceState {
  phase: RacePhase;
  /** Pasos que faltan para la salida. */
  countdownSteps: number;
  /** Pasos desde la salida. */
  raceSteps: number;
  /** Pasos de la vuelta en curso. */
  lapSteps: number;
  /** Vuelta en curso (empieza en 1). */
  lap: number;
  /** Siguiente checkpoint que hay que cruzar; 0 es la meta. */
  nextCheckpoint: number;
  /** Último checkpoint cruzado (donde se reaparece). */
  lastCheckpoint: number;
  /** Progreso del coche en el paso anterior (m). */
  progress: number;
  lapsCompleted: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  lastLapWasBest: boolean;
  wrongWay: boolean;
  wrongWaySteps: number;
  rightWaySteps: number;
}

export function stepsToMs(steps: number): number {
  return (steps * 1000) / SIM.hz;
}

export function secondsToSteps(seconds: number): number {
  return Math.round(seconds * SIM.hz);
}

export function createRaceState(bestLapMs: number | null): RaceState {
  return {
    phase: 'countdown',
    countdownSteps: secondsToSteps(RACE.countdownSeconds),
    raceSteps: 0,
    lapSteps: 0,
    lap: 1,
    nextCheckpoint: 1,
    lastCheckpoint: 0,
    progress: RACE.startOffset,
    lapsCompleted: 0,
    lastLapMs: null,
    bestLapMs,
    lastLapWasBest: false,
    wrongWay: false,
    wrongWaySteps: 0,
    rightWaySteps: 0,
  };
}

/** Avanza la cuenta atrás. Devuelve true en el paso en que se da la salida. */
export function updateCountdown(race: RaceState): boolean {
  if (race.phase !== 'countdown') return false;
  race.countdownSteps--;
  if (race.countdownSteps <= 0) {
    race.countdownSteps = 0;
    race.phase = 'racing';
    return true;
  }
  return false;
}

/**
 * Procesa el nuevo progreso del coche. Solo cuenta el cruce, hacia delante, del siguiente checkpoint
 * esperado: saltarse uno (atajar) o cruzarlos marcha atrás no avanza la vuelta.
 * Devuelve true si en este paso se completó una vuelta.
 */
export function updateProgress(race: RaceState, track: Track, progress: number): boolean {
  const length = track.length;
  const delta = progressDelta(race.progress, progress, length);
  const previous = race.progress;
  race.progress = progress;
  if (delta <= 0) return false;

  const target = track.checkpointProgress[race.nextCheckpoint] ?? 0;
  const ahead = mod(target - previous, length);
  if (ahead <= 0 || ahead > delta) return false;

  // Se cruzó el checkpoint esperado.
  const crossed = race.nextCheckpoint;
  race.lastCheckpoint = crossed;
  race.nextCheckpoint = (crossed + 1) % track.checkpointProgress.length;
  if (crossed !== 0) return false;

  // La meta con todos los checkpoints cruzados: vuelta completada.
  const lapMs = stepsToMs(race.lapSteps);
  race.lastLapMs = lapMs;
  race.lastLapWasBest = race.bestLapMs === null || lapMs < race.bestLapMs;
  if (race.lastLapWasBest) race.bestLapMs = lapMs;
  race.lapsCompleted++;
  race.lap++;
  race.lapSteps = 0;
  return true;
}

/**
 * Contramano: el coche avanza (no marcha atrás) con el morro opuesto al sentido de la pista.
 * El aviso aparece y desaparece con retardo para que no parpadee.
 */
export function updateWrongWay(race: RaceState, car: CarState, query: TrackQuery): void {
  const fx = Math.cos(car.heading);
  const fz = -Math.sin(car.heading);
  const facing = fx * query.tangentX + fz * query.tangentZ;
  const wrong = car.forwardSpeed > RACE.wrongWayMinSpeed && facing < RACE.wrongWayCos;
  if (wrong) {
    race.wrongWaySteps++;
    race.rightWaySteps = 0;
    if (race.wrongWaySteps >= secondsToSteps(RACE.wrongWayShowSeconds)) race.wrongWay = true;
  } else {
    race.rightWaySteps++;
    race.wrongWaySteps = 0;
    if (race.rightWaySteps >= secondsToSteps(RACE.wrongWayClearSeconds)) race.wrongWay = false;
  }
}

/** Progreso donde reaparece el coche: justo después del último checkpoint cruzado. */
export function respawnProgress(race: RaceState, track: Track): number {
  const base = track.checkpointProgress[race.lastCheckpoint] ?? 0;
  const offset =
    race.lastCheckpoint === 0 && race.lapsCompleted === 0 ? RACE.startOffset : RACE.respawnOffset;
  return mod(base + offset, track.length);
}
