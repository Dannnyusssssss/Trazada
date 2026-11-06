import { CAMERA } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { Settings } from '../save/storage';
import { button, el, setText, setVisible, toggle } from './dom';

/** Panel de ajustes: "Reducir movimiento", campo de visión base y silencio. Se aplican al momento. */
export class SettingsPanel {
  readonly root: HTMLElement;
  private readonly mute: HTMLInputElement;
  private readonly reduced: HTMLInputElement;
  private readonly fov: HTMLInputElement;
  private readonly fovValue: HTMLElement;
  private readonly backButton: HTMLButtonElement;

  constructor(onChange: (patch: Partial<Settings>) => void, onBack: () => void) {
    const mute = toggle(
      TEXTS.settings.mute,
      false,
      (muted) => onChange({ muted }),
      TEXTS.settings.muteHint,
    );
    const reduced = toggle(
      TEXTS.settings.reducedMotion,
      false,
      (reducedMotion) => onChange({ reducedMotion }),
      TEXTS.settings.reducedMotionHint,
    );
    this.mute = mute.input;
    this.reduced = reduced.input;
    this.fov = el('input', {
      attrs: {
        type: 'range',
        min: String(CAMERA.fovMin),
        max: String(CAMERA.fovMax),
        step: '1',
        id: 'fov-input',
      },
    });
    this.fovValue = el('output', { attrs: { for: 'fov-input' } });
    this.fov.addEventListener('input', () => {
      const fov = Number(this.fov.value);
      setText(this.fovValue, `${fov}${TEXTS.settings.fovUnit}`);
      onChange({ fov });
    });
    this.backButton = button(TEXTS.settings.back, onBack, 'btn btn-primary');
    this.root = el(
      'section',
      { className: 'screen panel settings-panel', attrs: { 'aria-labelledby': 'settings-title' } },
      [
        el('h2', { text: TEXTS.settings.title, attrs: { id: 'settings-title' } }),
        reduced.root,
        el('div', { className: 'range' }, [
          el('label', { text: TEXTS.settings.fov, attrs: { for: 'fov-input' } }),
          this.fov,
          this.fovValue,
        ]),
        mute.root,
        el('div', { className: 'actions' }, [this.backButton]),
      ],
    );
  }

  show(settings: Settings): void {
    this.mute.checked = settings.muted;
    this.reduced.checked = settings.reducedMotion;
    this.fov.value = String(settings.fov);
    setText(this.fovValue, `${settings.fov}${TEXTS.settings.fovUnit}`);
    setVisible(this.root, true);
    this.backButton.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
