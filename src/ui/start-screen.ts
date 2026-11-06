import { META } from '../data/meta';
import { TEXTS } from '../data/texts';
import { button, el, setVisible, toggle } from './dom';

export interface StartScreenActions {
  onPlay: () => void;
  onSettings: () => void;
  onReducedMotion: (value: boolean) => void;
}

/** Pantalla de inicio: título, instrucciones breves, aviso de contenido y acceso a "Reducir movimiento". */
export class StartScreen {
  readonly root: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly reducedMotionInput: HTMLInputElement;

  constructor(actions: StartScreenActions, reducedMotion: boolean) {
    this.playButton = button(TEXTS.start.play, actions.onPlay, 'btn btn-primary');
    const controls = el(
      'dl',
      { className: 'controls-list' },
      TEXTS.start.controls.flatMap(([keys, action]) => [
        el('dt', {}, [el('kbd', { text: keys })]),
        el('dd', { text: action }),
      ]),
    );
    const reduced = toggle(TEXTS.settings.reducedMotion, reducedMotion, actions.onReducedMotion);
    this.reducedMotionInput = reduced.input;
    this.root = el(
      'section',
      { className: 'screen panel start-screen', attrs: { 'aria-labelledby': 'start-title' } },
      [
        el('h1', { className: 'title', text: META.title, attrs: { id: 'start-title' } }),
        el('p', { className: 'subtitle', text: TEXTS.start.subtitle }),
        el('div', { className: 'start-columns' }, [
          el('div', {}, [el('h2', { text: TEXTS.start.controlsTitle }), controls]),
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
        el('div', { className: 'actions' }, [
          this.playButton,
          button(TEXTS.start.settings, actions.onSettings),
        ]),
        el('p', { className: 'hint', text: TEXTS.start.playHint }),
      ],
    );
  }

  show(reducedMotion: boolean): void {
    this.reducedMotionInput.checked = reducedMotion;
    setVisible(this.root, true);
    this.playButton.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
