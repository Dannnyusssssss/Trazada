import { CARS, type CarDef } from '../data/cars';
import { TEXTS } from '../data/texts';
import { TRACKS } from '../data/tracks';
import { bestOnTrack, isTrackUnlocked, medalFor } from '../game/progress';
import { button, el, setText, setVisible } from './dom';
import { formatLapTime, medalName, statDots } from './format';

export interface Selection {
  trackId: string;
  carId: string;
}

type BestLaps = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Valores para las barras de estadísticas de los coches. */
const STAT_GETTERS: readonly [keyof typeof TEXTS.select.stats, (c: CarDef) => number][] = [
  ['speed', (c) => c.params.maxSpeed],
  ['accel', (c) => c.params.engineAccel],
  ['handling', (c) => c.params.turnRate * (1 - c.params.turnHighSpeedReduction / 2)],
];

/**
 * Selección de circuito y coche. Usa grupos de botones de opción nativos: las flechas cambian la elección,
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
  private bestLaps: BestLaps = {};

  constructor(onRace: (selection: Selection) => void, onBack: () => void) {
    const trackFieldset = el('fieldset', { className: 'choice-group' }, [
      el('legend', { text: TEXTS.select.tracks }),
    ]);
    for (const def of TRACKS) {
      const input = el('input', { attrs: { type: 'radio', name: 'track', value: def.id } });
      input.addEventListener('change', () => this.refreshCarRecords());
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
    if (trackId === null || carId === null) return null;
    return { trackId, carId };
  }

  private refreshCarRecords(): void {
    const trackId = this.selection()?.trackId ?? '';
    for (const car of CARS) {
      const ms = this.bestLaps[trackId]?.[car.id] ?? null;
      const record = this.carRecords.get(car.id);
      if (record) setText(record, `${TEXTS.select.carRecord}: ${formatLapTime(ms)}`);
    }
  }

  /** Muestra la pantalla con el estado actual de récords y desbloqueos, y la última selección marcada. */
  show(bestLaps: BestLaps, last: Selection): void {
    this.bestLaps = bestLaps;
    let firstUnlocked: HTMLInputElement | null = null;
    TRACKS.forEach((def, index) => {
      const input = this.trackInputs.get(def.id);
      const info = this.trackInfo.get(def.id);
      if (!input || !info) return;
      const unlocked = isTrackUnlocked(TRACKS, index, bestLaps);
      input.disabled = !unlocked;
      if (unlocked && !firstUnlocked) firstUnlocked = input;
      const best = bestOnTrack(bestLaps, def.id);
      const previous = TRACKS[index - 1];
      setText(
        info,
        unlocked
          ? `${TEXTS.select.best}: ${formatLapTime(best)} · ${medalName(medalFor(def, best))}`
          : TEXTS.select.locked(previous?.name ?? ''),
      );
    });
    const lastTrack = this.trackInputs.get(last.trackId);
    const trackInput = lastTrack && !lastTrack.disabled ? lastTrack : firstUnlocked;
    if (trackInput) (trackInput as HTMLInputElement).checked = true;
    const carInput = this.carInputs.get(last.carId) ?? this.carInputs.values().next().value;
    if (carInput) carInput.checked = true;
    this.refreshCarRecords();
    setVisible(this.root, true);
    (trackInput as HTMLInputElement | null)?.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
