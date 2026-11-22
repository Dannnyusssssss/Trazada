import { TRACKS } from '../data/tracks';
import { validateGhost } from '../game/ghost';
import { isTrackUnlocked } from '../game/progress';
import type { World } from '../game/world';
import type { GhostStore } from '../save/ghost-storage';
import type { SaveStore } from '../save/storage';
import type { ResultsData } from '../ui/results-screen';
import type { RaceView } from './race-view';
import { buildResults, type SessionStart } from './results';

/**
 * Guardado de la sesión: récords de vuelta, fantasma del circuito y datos de los resultados. Con la física
 * cambiada desde el panel de depuración (`world.canRecord` falso) no se guarda nada de la sesión.
 */
export class SessionRecorder {
  private seenLaps = 0;
  private seenGhostVersion = 0;
  /** Récord y circuitos abiertos al empezar la sesión, para los resultados. */
  private readonly sessionStart: SessionStart = { recordAtStart: null, unlockedAtStart: [] };

  constructor(
    private readonly store: SaveStore,
    private readonly ghostStore: GhostStore,
    private readonly view: RaceView,
  ) {}

  /** Carga el fantasma guardado del circuito actual (si es válido). Solo en contrarreloj. */
  loadGhost(world: World): void {
    const track = world.track;
    const data = world.mode === 'timeTrial' ? this.ghostStore.load(track.def.id) : null;
    if (data && validateGhost(data, track)) {
      this.view.setGhost(data, world);
    } else {
      this.view.clearGhost();
    }
  }

  /** Anota el estado al empezar una sesión. */
  begin(world: World): void {
    this.seenLaps = 0;
    this.seenGhostVersion = world.ghostVersion;
    this.sessionStart.recordAtStart = this.store.getBestLap(world.track.def.id, world.carDef.id);
    this.sessionStart.unlockedAtStart = TRACKS.map((_, i) =>
      isTrackUnlocked(TRACKS, i, this.store.data.bestLaps),
    );
  }

  /** Olvida las vueltas vistas (al volver al menú). */
  resetLaps(): void {
    this.seenLaps = 0;
  }

  /**
   * Reacciona a lo que pasó en los pasos de simulación: récords y fantasma. Devuelve true si la sesión
   * ha terminado.
   */
  afterSteps(world: World): boolean {
    const race = world.race;
    const trackId = world.track.def.id;
    const timeTrial = world.mode === 'timeTrial';
    // Con la física cambiada desde el panel de depuración no se guarda nada de la sesión.
    const record = timeTrial && world.canRecord;
    if (race.lapsCompleted > this.seenLaps) {
      this.seenLaps = race.lapsCompleted;
      if (record && race.lastLapMs !== null) {
        this.store.recordLap(trackId, world.carDef.id, race.lastLapMs);
      }
    }
    if (timeTrial && world.ghostVersion !== this.seenGhostVersion) {
      this.seenGhostVersion = world.ghostVersion;
      const ghost = world.lastGhost;
      // El fantasma del circuito es la mejor vuelta con cualquier coche.
      const best = this.view.ghostLapMs;
      if (record && ghost && (best === null || ghost.lapMs < best)) {
        this.ghostStore.save(ghost);
        this.view.setGhost(ghost, world);
      }
    }
    return race.phase === 'finished';
  }

  /** Datos de la pantalla de resultados (en Carrera también guarda el puesto final). */
  results(world: World): ResultsData {
    return buildResults(world, this.store, this.sessionStart);
  }
}
