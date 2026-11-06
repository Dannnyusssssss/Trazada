import { TEXTS } from '../data/texts';
import type { Medal } from '../game/progress';
import { button, el, setText, setVisible } from './dom';
import { formatLapTime, medalName } from './format';

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
}

export interface ResultsActions {
  onRetry: () => void;
  onNext: () => void;
  onSelect: () => void;
  onMenu: () => void;
}

/** Pantalla de resultados de la sesión. Solo ofrece acciones internas del juego. */
export class ResultsScreen {
  readonly root: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly laps: HTMLElement;
  private readonly best: HTMLElement;
  private readonly medal: HTMLElement;
  private readonly record: HTMLElement;
  private readonly notices: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;

  constructor(actions: ResultsActions) {
    this.subtitle = el('p', { className: 'subtitle' });
    this.laps = el('ol', { className: 'lap-list' });
    this.best = el('dd');
    this.medal = el('dd');
    this.record = el('dd');
    this.notices = el('div', { attrs: { 'aria-live': 'polite' } });
    this.retryButton = button(TEXTS.results.retry, actions.onRetry, 'btn btn-primary');
    this.nextButton = button(TEXTS.results.next, actions.onNext);
    this.root = el(
      'section',
      { className: 'screen panel results-screen', attrs: { 'aria-labelledby': 'results-title' } },
      [
        el('h2', { text: TEXTS.results.title, attrs: { id: 'results-title' } }),
        this.subtitle,
        el('dl', { className: 'results-list' }, [
          el('dt', { text: TEXTS.results.sessionBest }),
          this.best,
          el('dt', { text: TEXTS.results.medal }),
          this.medal,
          el('dt', { text: TEXTS.results.record }),
          this.record,
        ]),
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
    setText(this.subtitle, `${data.trackName} · ${data.carName}`);
    this.laps.replaceChildren(
      ...data.lapTimes.map((ms) => {
        const best = ms === data.sessionBestMs;
        return el('li', { text: best ? `${formatLapTime(ms)} ★` : formatLapTime(ms) });
      }),
    );
    setText(this.best, formatLapTime(data.sessionBestMs));
    setText(this.medal, medalName(data.medal));
    this.medal.dataset.medal = data.medal ?? 'none';
    setText(this.record, formatLapTime(data.recordMs));
    const notices: HTMLElement[] = [];
    if (data.newRecord)
      notices.push(el('p', { className: 'notice-good', text: TEXTS.results.newRecord }));
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
