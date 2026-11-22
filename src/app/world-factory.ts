import type { Difficulty } from '../data/balance';
import { CARS, carById, type CarDef } from '../data/cars';
import { TRACKS, type TrackDef } from '../data/tracks';
import { isTrackUnlocked } from '../game/progress';
import { Track } from '../game/track';
import { raceSeed, World, type GameMode } from '../game/world';
import type { SaveStore } from '../save/storage';

/** Crea los mundos de cada sesión, con los circuitos ya muestreados en caché y una semilla por carrera. */
export class WorldFactory {
  private readonly tracks = new Map<string, Track>();
  private raceAttempt = 0;

  constructor(private readonly store: SaveStore) {}

  private getTrack(def: TrackDef): Track {
    let track = this.tracks.get(def.id);
    if (!track) {
      track = new Track(def);
      this.tracks.set(def.id, track);
    }
    return track;
  }

  /** Última selección guardada, si el circuito sigue abierto; si no, el primero. */
  initialSelection(): { track: TrackDef; car: CarDef } {
    const settings = this.store.data.settings;
    const index = TRACKS.findIndex((t) => t.id === settings.lastTrackId);
    const unlocked = index >= 0 && isTrackUnlocked(TRACKS, index, this.store.data.bestLaps);
    const track = (unlocked ? TRACKS[index] : TRACKS[0]) ?? TRACKS[0];
    const car = carById(settings.lastCarId) ?? CARS[0];
    if (!track || !car) throw new Error('Faltan circuitos o coches');
    return { track, car };
  }

  /** Cada carrera tiene su propia semilla: los rivales varían un poco de una a otra. */
  nextAttempt(): void {
    this.raceAttempt++;
  }

  create(trackDef: TrackDef, carDef: CarDef, mode: GameMode, difficulty: Difficulty): World {
    // En Carrera los récords de vuelta no se usan: solo cuentan los de la contrarreloj.
    const best = mode === 'timeTrial' ? this.store.getBestLap(trackDef.id, carDef.id) : null;
    const world = new World(this.getTrack(trackDef), carDef, best, {
      mode,
      difficulty,
      seed: raceSeed(trackDef.id, difficulty, this.raceAttempt),
    });
    world.assists = { ...this.store.data.settings.assists };
    return world;
  }
}
