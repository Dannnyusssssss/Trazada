import { describe, expect, it } from 'vitest';
import { mod } from '../src/core/math';
import { RACE, SIM } from '../src/data/balance';
import { TRACKS } from '../src/data/tracks';
import { createCarState, placeCar } from '../src/game/car';
import {
  createRaceState,
  respawnProgress,
  stepsToMs,
  updateCountdown,
  updateProgress,
  updateWrongWay,
  type RaceState,
} from '../src/game/race';
import { Track, createTrackQuery } from '../src/game/track';

const def = TRACKS[0];
if (!def) throw new Error('sin circuitos');
const track = new Track(def);

/** Avanza (o retrocede) el progreso en pasos pequeños, contando pasos de vuelta. Devuelve las vueltas hechas. */
function drive(race: RaceState, distance: number, stepSize = 0.8): number {
  let laps = 0;
  const steps = Math.ceil(Math.abs(distance) / stepSize);
  const dir = Math.sign(distance);
  for (let i = 0; i < steps; i++) {
    race.lapSteps++;
    if (updateProgress(race, track, mod(race.progress + dir * stepSize, track.length))) laps++;
  }
  return laps;
}

describe('cuenta atrás', () => {
  it('dura lo indicado y luego empieza la carrera', () => {
    const race = createRaceState(null);
    const steps = RACE.countdownSeconds * SIM.hz;
    for (let i = 0; i < steps - 1; i++) expect(updateCountdown(race)).toBe(false);
    expect(updateCountdown(race)).toBe(true);
    expect(race.phase).toBe('racing');
    expect(updateCountdown(race)).toBe(false);
  });
});

describe('checkpoints y vueltas', () => {
  it('una vuelta completa en orden cuenta', () => {
    const race = createRaceState(null);
    expect(drive(race, track.length)).toBe(1);
    expect(race.lap).toBe(2);
    expect(race.lastLapMs).not.toBeNull();
    expect(race.bestLapMs).toBe(race.lastLapMs);
  });

  it('cruzar la meta sin pasar los checkpoints no cuenta', () => {
    const race = createRaceState(null);
    // Marcha atrás a través de la meta y otra vez hacia delante.
    drive(race, -30);
    expect(drive(race, 60)).toBe(0);
    expect(race.lap).toBe(1);
  });

  it('saltarse un checkpoint (atajo) no avanza la vuelta', () => {
    const race = createRaceState(null);
    drive(race, (track.checkpointProgress[2] ?? 0) + 5);
    expect(race.nextCheckpoint).toBe(3);
    // Atajo: el coche aparece más allá del checkpoint 3 sin haberlo cruzado.
    race.progress = (track.checkpointProgress[3] ?? 0) + 10;
    drive(race, track.length - race.progress + 20);
    expect(race.lapsCompleted).toBe(0);
    expect(race.nextCheckpoint).toBe(3);
  });

  it('recorrer la vuelta hacia atrás no cuenta', () => {
    const race = createRaceState(null);
    expect(drive(race, -track.length)).toBe(0);
    expect(race.nextCheckpoint).toBe(1);
  });

  it('guarda la mejor vuelta solo si mejora', () => {
    const race = createRaceState(60_000);
    drive(race, track.length, 0.8);
    // Unos 2300 pasos de 0.8 m: ~38 s, mejora el récord de 60 s.
    expect(race.lastLapWasBest).toBe(true);
    const best = race.bestLapMs;
    // Vuelta más lenta (pasos más cortos = más pasos).
    drive(race, track.length, 0.4);
    expect(race.lastLapWasBest).toBe(false);
    expect(race.bestLapMs).toBe(best);
  });

  it('convierte pasos a milisegundos', () => {
    expect(stepsToMs(SIM.hz)).toBe(1000);
  });

  it('reaparece tras el último checkpoint cruzado', () => {
    const race = createRaceState(null);
    expect(respawnProgress(race, track)).toBeCloseTo(RACE.startOffset);
    drive(race, (track.checkpointProgress[3] ?? 0) + 20);
    expect(race.lastCheckpoint).toBe(3);
    expect(respawnProgress(race, track)).toBeCloseTo(
      (track.checkpointProgress[3] ?? 0) + RACE.respawnOffset,
    );
  });
});

describe('contramano', () => {
  it('avisa con retardo al circular en sentido contrario y se quita al corregir', () => {
    const race = createRaceState(null);
    const car = createCarState();
    const query = createTrackQuery();
    track.query(track.x(100), track.z(100), query);
    const h = Math.atan2(-query.tangentZ, query.tangentX);
    placeCar(car, track.x(100), track.z(100), h + Math.PI);
    car.forwardSpeed = 15;
    const showSteps = RACE.wrongWayShowSeconds * SIM.hz;
    for (let i = 0; i < showSteps - 1; i++) updateWrongWay(race, car, query);
    expect(race.wrongWay).toBe(false);
    updateWrongWay(race, car, query);
    expect(race.wrongWay).toBe(true);
    placeCar(car, track.x(100), track.z(100), h);
    car.forwardSpeed = 15;
    for (let i = 0; i < RACE.wrongWayClearSeconds * SIM.hz; i++) updateWrongWay(race, car, query);
    expect(race.wrongWay).toBe(false);
  });

  it('ir marcha atrás no es contramano', () => {
    const race = createRaceState(null);
    const car = createCarState();
    const query = createTrackQuery();
    track.query(track.x(100), track.z(100), query);
    placeCar(car, track.x(100), track.z(100), Math.atan2(-query.tangentZ, query.tangentX));
    car.forwardSpeed = -8;
    for (let i = 0; i < 300; i++) updateWrongWay(race, car, query);
    expect(race.wrongWay).toBe(false);
  });
});
