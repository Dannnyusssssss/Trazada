import {
  actionKeysLabel,
  DEFAULT_KEY_MAP,
  type BindableAction,
  type KeyMap,
} from '../core/bindings';
import { META } from '../data/meta';
import { TEXTS } from '../data/texts';
import { button, el, setText, setVisible, toggle } from './dom';

export interface StartScreenActions {
  onPlay: () => void;
  onSettings: () => void;
  onReducedMotion: (value: boolean) => void;
}

/** Pantalla de inicio: título, instrucciones breves, aviso de contenido y acceso a "Reducir movimiento". */
export class StartScreen {
  readonly root: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly settingsButton: HTMLButtonElement;
  private readonly reducedMotionInput: HTMLInputElement;
  /** Teclas de cada fila de la lista de controles (se rellenan con las configuradas). */
  private readonly keyCells: { node: HTMLElement; actions: readonly BindableAction[] }[] = [];

  constructor(actions: StartScreenActions, reducedMotion: boolean) {
    this.playButton = button(TEXTS.start.play, actions.onPlay, 'btn btn-primary');
    this.settingsButton = button(TEXTS.start.settings, actions.onSettings);
    const controls = el(
      'dl',
      { className: 'controls-list' },
      TEXTS.start.controls.flatMap(([actions, action, pad]) => {
        const keys = el('kbd');
        this.keyCells.push({ node: keys, actions });
        return [
          el('dt', {}, [keys]),
          el('dd', { text: action }),
          // Botón del mando equivalente, con su nombre accesible (no solo la abreviatura).
          el(
            'dd',
            { className: 'pad-button' },
            pad
              ? [
                  el('kbd', {
                    text: pad,
                    attrs: { 'aria-label': `${TEXTS.start.gamepadLabel}: ${pad}` },
                  }),
                ]
              : [],
          ),
        ];
      }),
    );
    this.setKeys(DEFAULT_KEY_MAP);
    const reduced = toggle(TEXTS.settings.reducedMotion, reducedMotion, actions.onReducedMotion);
    this.reducedMotionInput = reduced.input;
    this.root = el(
      'section',
      { className: 'screen panel start-screen', attrs: { 'aria-labelledby': 'start-title' } },
      [
        el('h1', { className: 'title', text: META.title, attrs: { id: 'start-title' } }),
        el('p', { className: 'subtitle', text: TEXTS.start.subtitle }),
        el('div', { className: 'start-columns' }, [
          el('div', {}, [
            el('h2', { text: TEXTS.start.controlsTitle }),
            el('div', { className: 'controls-head', attrs: { 'aria-hidden': 'true' } }, [
              el('span', { text: TEXTS.start.gamepadLabel }),
            ]),
            controls,
            el('p', { className: 'hint only-keys', text: TEXTS.start.keysNote }),
            el('div', { className: 'only-touch' }, [
              el('h3', { text: TEXTS.start.touchControlsTitle }),
              el('p', { text: TEXTS.start.touchControls }),
            ]),
          ]),
          el('div', {}, [
            el('h2', { text: TEXTS.start.rulesTitle }),
            el('p', { text: TEXTS.start.rules }),
            el('div', { className: 'notice', attrs: { role: 'note' } }, [
              el('strong', { text: TEXTS.start.warningTitle }),
              el('p', { text: TEXTS.start.warning }),
              reduced.root,
            ]),
          ]),
        ]),
        el('div', { className: 'actions' }, [this.playButton, this.settingsButton]),
        el('p', { className: 'hint only-keys', text: TEXTS.start.playHint }),
        el('p', { className: 'hint only-touch', text: TEXTS.start.touchHint }),
      ],
    );
  }

  /** `fromSettings`: se vuelve de los ajustes y el foco regresa a su botón. */
  show(reducedMotion: boolean, fromSettings = false): void {
    this.reducedMotionInput.checked = reducedMotion;
    setVisible(this.root, true);
    (fromSettings ? this.settingsButton : this.playButton).focus({ preventScroll: true });
  }

  /** Muestra las teclas configuradas en la lista de controles. */
  setKeys(map: KeyMap): void {
    for (const cell of this.keyCells) {
      setText(cell.node, cell.actions.map((a) => actionKeysLabel(map, a)).join(' · '));
    }
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
