import { CAMERA, type Quality } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { Settings } from '../save/storage';
import { button, el, setText, setVisible, toggle } from './dom';

/** Grupo de botones de opción nativo (las flechas cambian la opción). */
function radioGroup<T extends string>(
  legend: string,
  name: string,
  options: Readonly<Record<T, string>>,
  onChange: (value: T) => void,
  hint: string,
): { root: HTMLElement; inputs: Map<T, HTMLInputElement> } {
  const inputs = new Map<T, HTMLInputElement>();
  const root = el('fieldset', { className: 'radio-row' }, [el('legend', { text: legend })]);
  for (const [value, label] of Object.entries(options) as [T, string][]) {
    const input = el('input', { attrs: { type: 'radio', name, value } });
    input.addEventListener('change', () => {
      if (input.checked) onChange(value);
    });
    inputs.set(value, input);
    root.appendChild(el('label', { className: 'radio' }, [input, el('span', { text: label })]));
  }
  root.appendChild(el('small', { className: 'hint', text: hint }));
  return { root, inputs };
}

/**
 * Panel de ajustes: "Reducir movimiento", campo de visión, calidad gráfica, cámara y silencio.
 * Los cambios se aplican al momento.
 */
export class SettingsPanel {
  readonly root: HTMLElement;
  private readonly mute: HTMLInputElement;
  private readonly reduced: HTMLInputElement;
  private readonly fov: HTMLInputElement;
  private readonly fovValue: HTMLElement;
  private readonly quality: Map<Quality, HTMLInputElement>;
  private readonly camera: Map<'chase' | 'high', HTMLInputElement>;
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
    const quality = radioGroup<Quality>(
      TEXTS.settings.quality,
      'quality',
      TEXTS.settings.qualityOptions,
      (value) => onChange({ quality: value }),
      TEXTS.settings.qualityHint,
    );
    const camera = radioGroup<'chase' | 'high'>(
      TEXTS.settings.camera,
      'camera',
      TEXTS.settings.cameraOptions,
      (value) => onChange({ camera: value }),
      TEXTS.settings.cameraHint,
    );
    this.quality = quality.inputs;
    this.camera = camera.inputs;
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
        quality.root,
        camera.root,
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
    const q = this.quality.get(settings.quality);
    if (q) q.checked = true;
    const c = this.camera.get(settings.camera);
    if (c) c.checked = true;
    setVisible(this.root, true);
    this.backButton.focus({ preventScroll: true });
  }

  hide(): void {
    setVisible(this.root, false);
  }
}
