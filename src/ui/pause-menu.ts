import { actionKeysLabel, DEFAULT_KEY_MAP, type KeyMap } from '../core/bindings';
import { TEXTS } from '../data/texts';
import { button, el, setText, setVisible } from './dom';

export interface PauseActions {
  onResume: () => void;
  onRestart: () => void;
  onSelect: () => void;
  onSettings: () => void;
  onMenu: () => void;
}

/** Menú de pausa. Indica si la pausa fue automática por perder el foco. */
export class PauseMenu {
  readonly root: HTMLElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly message: HTMLElement;
  private readonly touchMessage: HTMLElement;
  private keys: KeyMap = DEFAULT_KEY_MAP;

  constructor(actions: PauseActions) {
    this.resumeButton = button(TEXTS.pause.resume, actions.onResume, 'btn btn-primary');
    this.settingsButton = button(TEXTS.pause.settings, actions.onSettings);
    this.message = el('p', { className: 'hint' });
    this.touchMessage = el('p', { className: 'hint only-touch', text: TEXTS.pause.touchHint });
    this.root = el(
      'section',
      { className: 'screen panel pause-menu', attrs: { 'aria-labelledby': 'pause-title' } },
      [
        el('h2', { text: TEXTS.pause.title, attrs: { id: 'pause-title' } }),
        this.message,
        this.touchMessage,
        el('div', { className: 'actions actions-column' }, [
          this.resumeButton,
          button(TEXTS.pause.restart, actions.onRestart),
          button(TEXTS.pause.select, actions.onSelect),
          this.settingsButton,
          button(TEXTS.pause.menu, actions.onMenu),
        ]),
      ],
    );
  }

  /** `fromSettings`: se vuelve de los ajustes y el foco regresa a su botón. */
  show(focusLost: boolean, fromSettings = false): void {
    setText(
      this.message,
      focusLost ? TEXTS.pause.focusLost : TEXTS.pause.hint(actionKeysLabel(this.keys, 'pause')),
    );
    // La pista de teclas solo se ve sin pantalla táctil; el aviso de foco perdido, siempre.
    this.message.classList.toggle('only-keys', !focusLost);
    setVisible(this.touchMessage, !focusLost);
    setVisible(this.root, true);
    (fromSettings ? this.settingsButton : this.resumeButton).focus({ preventScroll: true });
  }

  /** Teclas configuradas (para la pista «Pulsa … para continuar»). */
  setKeys(map: KeyMap): void {
    this.keys = map;
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
