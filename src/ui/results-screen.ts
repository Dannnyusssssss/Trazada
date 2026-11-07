import { TEXTS } from '../data/texts';
import type { Medal } from '../game/progress';
import { button, el, setText, setVisible } from './dom';
import { formatLapTime, formatRaceTime, medalName } from './format';

/** Una fila de la clasificación final de una carrera. */
export interface Standing {
  name: string;
  /** Tiempo total (ms), o null si aún no había cruzado la meta. */
  timeMs: number | null;
  isPlayer: boolean;
}

/** Datos propios del modo Carrera. */
export interface RaceResults {
  position: number;
  total: number;
  totalMs: number | null;
  standings: readonly Standing[];
  /** Mejor puesto guardado en este circuito y dificultad (tras esta carrera). */
  bestPosition: number | null;
  newBestPosition: boolean;
}

export interface ResultsData {
  trackName: string;
  carName: string;
  lapTimes: readonly number[];
  sessionBestMs: number | null;
  medal: Medal | null;
  recordMs: number | null;
  newRecord: boolean;
  /** Nombre del circuito recién desbloqueado, si lo hay. */
  unlockedTrack: string | null;
  /** Hay un circuito siguiente abierto. */
  hasNext: boolean;
  /** Resultados de la carrera contra rivales, o null en contrarreloj. */
  race: RaceResults | null;
}

export interface ResultsActions {
  onRetry: () => void;
  onNext: () => void;
  onSelect: () => void;
  onMenu: () => void;
}

/** Pantalla de resultados de la sesión o de la carrera. Solo ofrece acciones internas del juego. */
export class ResultsScreen {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly laps: HTMLElement;
  private readonly best: HTMLElement;
  private readonly medal: HTMLElement;
  private readonly record: HTMLElement;
  private readonly timeTrialRows: HTMLElement[];
  private readonly raceRows: HTMLElement[];
  private readonly position: HTMLElement;
  private readonly totalTime: HTMLElement;
  private readonly bestPosition: HTMLElement;
  private readonly standingsTitle: HTMLElement;
  private readonly standings: HTMLElement;
  private readonly notices: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;

  constructor(actions: ResultsActions) {
    this.title = el('h2', { text: TEXTS.results.title, attrs: { id: 'results-title' } });
    this.subtitle = el('p', { className: 'subtitle' });
    this.laps = el('ol', { className: 'lap-list' });
    this.best = el('dd');
    this.medal = el('dd');
    this.record = el('dd');
    this.position = el('dd');
    this.totalTime = el('dd');
    this.bestPosition = el('dd');
    const medalTerm = el('dt', { text: TEXTS.results.medal });
    const recordTerm = el('dt', { text: TEXTS.results.record });
    const positionTerm = el('dt', { text: TEXTS.results.position });
    const totalTerm = el('dt', { text: TEXTS.results.totalTime });
    const bestPositionTerm = el('dt', { text: TEXTS.results.bestPosition });
    this.timeTrialRows = [medalTerm, this.medal, recordTerm, this.record];
    this.raceRows = [
      positionTerm,
      this.position,
      totalTerm,
      this.totalTime,
      bestPositionTerm,
      this.bestPosition,
    ];
    this.standingsTitle = el('h3', { text: TEXTS.results.standings });
    this.standings = el('ol', { className: 'standings' });
    this.notices = el('div', { attrs: { 'aria-live': 'polite' } });
    this.retryButton = button(TEXTS.results.retry, actions.onRetry, 'btn btn-primary');
    this.nextButton = button(TEXTS.results.next, actions.onNext);
    this.root = el(
      'section',
      { className: 'screen panel results-screen', attrs: { 'aria-labelledby': 'results-title' } },
      [
        this.title,
        this.subtitle,
        el('dl', { className: 'results-list' }, [
          positionTerm,
          this.position,
          totalTerm,
          this.totalTime,
          el('dt', { text: TEXTS.results.sessionBest }),
          this.best,
          medalTerm,
          this.medal,
          recordTerm,
          this.record,
          bestPositionTerm,
          this.bestPosition,
        ]),
        this.standingsTitle,
        this.standings,
        el('h3', { text: TEXTS.results.laps }),
        this.laps,
        this.notices,
        el('div', { className: 'actions' }, [
          this.retryButton,
          this.nextButton,
          button(TEXTS.results.select, actions.onSelect),
          button(TEXTS.results.menu, actions.onMenu),
        ]),
      ],
    );
    setVisible(this.root, false);
  }

  show(data: ResultsData): void {
    const race = data.race;
    setText(this.title, race ? TEXTS.results.raceTitle : TEXTS.results.title);
    setText(this.subtitle, `${data.trackName} · ${data.carName}`);
    this.laps.replaceChildren(
      ...data.lapTimes.map((ms) => {
        const best = ms === data.sessionBestMs;
        return el('li', { text: best ? `${formatLapTime(ms)} ★` : formatLapTime(ms) });
      }),
    );
    setText(this.best, formatLapTime(data.sessionBestMs));
    for (const row of this.timeTrialRows) setVisible(row, race === null);
    for (const row of this.raceRows) setVisible(row, race !== null);
    setVisible(this.standingsTitle, race !== null);
    setVisible(this.standings, race !== null);
    const notices: HTMLElement[] = [];
    if (race) {
      setText(this.position, TEXTS.results.positionValue(race.position, race.total));
      this.position.dataset.place = String(race.position);
      setText(this.totalTime, formatRaceTime(race.totalMs));
      setText(
        this.bestPosition,
        race.bestPosition === null
          ? '—'
          : TEXTS.results.positionValue(race.bestPosition, race.total),
      );
      // Clasificación: posición, nombre (con «tú» en el del jugador, no solo un color) y tiempo.
      this.standings.replaceChildren(
        ...race.standings.map((s) =>
          el('li', {
            className: s.isPlayer ? 'standing-player' : '',
            text: `${s.isPlayer ? `${s.name} (${TEXTS.results.you})` : s.name} — ${
              s.timeMs === null ? TEXTS.results.notFinished : formatRaceTime(s.timeMs)
            }`,
          }),
        ),
      );
      if (race.position === 1)
        notices.push(el('p', { className: 'notice-good', text: TEXTS.results.win }));
      if (race.newBestPosition) {
        notices.push(el('p', { className: 'notice-good', text: TEXTS.results.newBestPosition }));
      }
    } else {
      setText(this.medal, medalName(data.medal));
      this.medal.dataset.medal = data.medal ?? 'none';
      setText(this.record, formatLapTime(data.recordMs));
      if (data.newRecord)
        notices.push(el('p', { className: 'notice-good', text: TEXTS.results.newRecord }));
    }
    if (data.unlockedTrack) {
      notices.push(
        el('p', { className: 'notice-good', text: TEXTS.results.unlocked(data.unlockedTrack) }),
      );
    }
    this.notices.replaceChildren(...notices);
    setVisible(this.nextButton, data.hasNext);
    setVisible(this.root, true);
    this.retryButton.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
