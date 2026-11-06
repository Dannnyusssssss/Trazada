import { TEXTS } from '../data/texts';
import { button, el, setText, setVisible } from './dom';

export interface PauseActions {
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onMenu: () => void;
}

/** Menú de pausa. Indica si la pausa fue automática por perder el foco. */
export class PauseMenu {
  readonly root: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly message: HTMLElement;

  constructor(actions: PauseActions) {
    this.resumeButton = button(TEXTS.pause.resume, actions.onResume, 'btn btn-primary');
    this.message = el('p', { className: 'hint' });
    this.root = el(
      'section',
      { className: 'screen panel pause-menu', attrs: { 'aria-labelledby': 'pause-title' } },
      [
        el('h2', { text: TEXTS.pause.title, attrs: { id: 'pause-title' } }),
        this.message,
        el('div', { className: 'actions actions-column' }, [
          this.resumeButton,
          button(TEXTS.pause.restart, actions.onRestart),
          button(TEXTS.pause.settings, actions.onSettings),
          button(TEXTS.pause.menu, actions.onMenu),
        ]),
      ],
    );
  }

  show(focusLost: boolean): void {
    setText(this.message, focusLost ? TEXTS.pause.focusLost : TEXTS.pause.hint);
    setVisible(this.root, true);
    this.resumeButton.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
