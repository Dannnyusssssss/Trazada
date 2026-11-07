import { DIFFICULTIES, type Difficulty } from '../data/balance';
import { CARS, type CarDef } from '../data/cars';
import { TEXTS } from '../data/texts';
import { TRACKS } from '../data/tracks';
import { bestOnTrack, isTrackUnlocked, medalFor } from '../game/progress';
import type { GameMode } from '../game/world';
import { button, el, setText, setVisible } from './dom';
import { formatLapTime, medalName, statDots } from './format';

export interface Selection {
  trackId: string;
  carId: string;
  mode: GameMode;
  difficulty: Difficulty;
}

type BestLaps = Readonly<Record<string, Readonly<Record<string, number>>>>;
type RaceBest = Readonly<Record<string, Readonly<Partial<Record<Difficulty, number>>>>>;

const MODES: readonly GameMode[] = ['timeTrial', 'race'];

/** Valores para las barras de estadísticas de los coches. */
const STAT_GETTERS: readonly [keyof typeof TEXTS.select.stats, (c: CarDef) => number][] = [
  ['speed', (c) => c.params.maxSpeed],
  ['accel', (c) => c.params.engineAccel],
  ['handling', (c) => c.params.turnRate * (1 - c.params.turnHighSpeedReduction / 2)],
];

/**
 * Selección de modo, dificultad, circuito y coche. Usa grupos de botones de opción nativos: las flechas cambian la elección,
 * Tab pasa de un grupo a otro e Intro sobre una opción empieza la carrera. No usa <form>: el portal carga el
 * juego en un iframe sin permiso de formularios. Los circuitos bloqueados están
 * desactivados y explican el requisito con texto.
 */
export class SelectScreen {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly trackInputs = new Map<string, HTMLInputElement>();
  private readonly trackInfo = new Map<string, HTMLElement>();
  private readonly carInputs = new Map<string, HTMLInputElement>();
  private readonly carRecords = new Map<string, HTMLElement>();
  private readonly modeInputs = new Map<GameMode, HTMLInputElement>();
  private readonly difficultyInputs = new Map<Difficulty, HTMLInputElement>();
  private readonly difficultyFieldset: HTMLFieldSetElement;
  private bestLaps: BestLaps = {};
  private raceBest: RaceBest = {};

  constructor(onRace: (selection: Selection) => void, onBack: () => void) {
    const modeFieldset = el('fieldset', { className: 'radio-row' }, [
      el('legend', { text: TEXTS.select.mode }),
    ]);
    for (const mode of MODES) {
      const input = el('input', { attrs: { type: 'radio', name: 'mode', value: mode } });
      input.addEventListener('change', () => this.refresh());
      this.modeInputs.set(mode, input);
      modeFieldset.appendChild(
        el('label', { className: 'radio' }, [
          input,
          el('span', { text: TEXTS.select.modes[mode] }),
          el('small', { className: 'radio-hint', text: TEXTS.select.modeHints[mode] }),
        ]),
      );
    }
    this.difficultyFieldset = el('fieldset', { className: 'radio-row' }, [
      el('legend', { text: TEXTS.select.difficulty }),
    ]);
    for (const difficulty of DIFFICULTIES) {
      const input = el('input', {
        attrs: { type: 'radio', name: 'difficulty', value: difficulty },
      });
      input.addEventListener('change', () => this.refresh());
      this.difficultyInputs.set(difficulty, input);
      this.difficultyFieldset.appendChild(
        el('label', { className: 'radio' }, [
          input,
          el('span', { text: TEXTS.select.difficulties[difficulty] }),
        ]),
      );
    }
    const trackFieldset = el('fieldset', { className: 'choice-group' }, [
      el('legend', { text: TEXTS.select.tracks }),
    ]);
    for (const def of TRACKS) {
      const input = el('input', { attrs: { type: 'radio', name: 'track', value: def.id } });
      input.addEventListener('change', () => this.refresh());
      const info = el('span', { className: 'choice-info' });
      const { gold, silver, bronze } = def.medals;
      trackFieldset.appendChild(
        el('label', { className: 'choice' }, [
          input,
          el('span', { className: 'choice-body' }, [
            el('strong', { text: def.name }),
            el('span', { className: 'hint', text: def.description }),
            info,
            el('span', {
              className: 'hint',
              text: `${TEXTS.select.targets}: ${TEXTS.medals.gold} ${formatLapTime(gold)} · ${TEXTS.medals.silver} ${formatLapTime(silver)} · ${TEXTS.medals.bronze} ${formatLapTime(bronze)}`,
            }),
          ]),
        ]),
      );
      this.trackInputs.set(def.id, input);
      this.trackInfo.set(def.id, info);
    }

    const carFieldset = el('fieldset', { className: 'choice-group' }, [
      el('legend', { text: TEXTS.select.cars }),
    ]);
    const ranges = STAT_GETTERS.map(([, get]) => {
      const values = CARS.map(get);
      return [Math.min(...values), Math.max(...values)] as const;
    });
    for (const car of CARS) {
      const input = el('input', { attrs: { type: 'radio', name: 'car', value: car.id } });
      const record = el('span', { className: 'choice-info' });
      const stats = STAT_GETTERS.map(([key, get], k) => {
        const [min, max] = ranges[k] ?? [0, 1];
        return el('span', {
          className: 'stat',
          text: `${TEXTS.select.stats[key]} ${statDots(get(car), min, max)}`,
        });
      });
      carFieldset.appendChild(
        el('label', { className: 'choice' }, [
          input,
          el('span', { className: 'choice-body' }, [
            el('strong', { text: car.name }),
            el('span', { className: 'hint', text: car.description }),
            el('span', { className: 'stats' }, stats),
            record,
          ]),
        ]),
      );
      this.carInputs.set(car.id, input);
      this.carRecords.set(car.id, record);
    }

    const race = (): void => {
      const selection = this.selection();
      if (selection) onRace(selection);
    };
    const raceButton = button(TEXTS.select.race, race, 'btn btn-primary');
    this.body = el('div', { className: 'select-form' }, [
      el('div', { className: 'select-modes' }, [modeFieldset, this.difficultyFieldset]),
      el('div', { className: 'select-columns' }, [trackFieldset, carFieldset]),
      el('div', { className: 'actions' }, [raceButton, button(TEXTS.select.back, onBack)]),
      el('p', { className: 'hint', text: TEXTS.select.hint }),
    ]);
    // Intro sobre una opción empieza la carrera (como el botón "Correr").
    this.body.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        race();
      }
    });
    this.root = el(
      'section',
      { className: 'screen panel select-screen', attrs: { 'aria-labelledby': 'select-title' } },
      [el('h2', { text: TEXTS.select.title, attrs: { id: 'select-title' } }), this.body],
    );
    setVisible(this.root, false);
  }

  private selection(): Selection | null {
    const checked = (name: string): string | null =>
      this.body.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)?.value ?? null;
    const trackId = checked('track');
    const carId = checked('car');
    const mode = MODES.find((m) => m === checked('mode')) ?? 'timeTrial';
    const difficulty = DIFFICULTIES.find((d) => d === checked('difficulty')) ?? 'normal';
    if (trackId === null || carId === null) return null;
    return { trackId, carId, mode, difficulty };
  }

  /** Actualiza los textos que dependen de la elección (récords, mejor puesto, dificultad activa). */
  private refresh(): void {
    const selection = this.selection();
    const race = selection?.mode === 'race';
    // La dificultad solo tiene sentido en Carrera; en contrarreloj se desactiva (sigue visible).
    this.difficultyFieldset.disabled = !race;
    TRACKS.forEach((def, index) => {
      const info = this.trackInfo.get(def.id);
      if (!info) return;
      const unlocked = isTrackUnlocked(TRACKS, index, this.bestLaps);
      const previous = TRACKS[index - 1];
      if (!unlocked) {
        setText(info, TEXTS.select.locked(previous?.name ?? ''));
        return;
      }
      const best = bestOnTrack(this.bestLaps, def.id);
      const lapText = `${TEXTS.select.best}: ${formatLapTime(best)} · ${medalName(medalFor(def, best))}`;
      if (race && selection) {
        const position = this.raceBest[def.id]?.[selection.difficulty];
        const positionText = position === undefined ? '—' : `${position}.º`;
        setText(info, `${TEXTS.select.raceBest}: ${positionText} · ${lapText}`);
      } else {
        setText(info, lapText);
      }
    });
    const trackId = selection?.trackId ?? '';
    for (const car of CARS) {
      const ms = this.bestLaps[trackId]?.[car.id] ?? null;
      const record = this.carRecords.get(car.id);
      if (record) setText(record, `${TEXTS.select.carRecord}: ${formatLapTime(ms)}`);
    }
  }

  /** Muestra la pantalla con el estado actual de récords y desbloqueos, y la última selección marcada. */
  show(bestLaps: BestLaps, raceBest: RaceBest, last: Selection): void {
    this.bestLaps = bestLaps;
    this.raceBest = raceBest;
    let firstUnlocked: HTMLInputElement | null = null;
    TRACKS.forEach((def, index) => {
      const input = this.trackInputs.get(def.id);
      if (!input) return;
      const unlocked = isTrackUnlocked(TRACKS, index, bestLaps);
      input.disabled = !unlocked;
      if (unlocked && !firstUnlocked) firstUnlocked = input;
    });
    const modeInput = this.modeInputs.get(last.mode);
    if (modeInput) modeInput.checked = true;
    const difficultyInput = this.difficultyInputs.get(last.difficulty);
    if (difficultyInput) difficultyInput.checked = true;
    const lastTrack = this.trackInputs.get(last.trackId);
    const trackInput = lastTrack && !lastTrack.disabled ? lastTrack : firstUnlocked;
    if (trackInput) (trackInput as HTMLInputElement).checked = true;
    const carInput = this.carInputs.get(last.carId) ?? this.carInputs.values().next().value;
    if (carInput) carInput.checked = true;
    this.refresh();
    setVisible(this.root, true);
    // El foco empieza en el modo: así Tab recorre modo, dificultad, circuito y coche en orden.
    (modeInput ?? (trackInput as HTMLInputElement | null))?.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
