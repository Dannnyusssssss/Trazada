import {
  assignKey,
  BINDABLE_ACTIONS,
  clearKey,
  keyLabel,
  type AssignResult,
  type BindableAction,
  type KeySlot,
} from '../core/bindings';
import type { KeyboardSteerResponse } from '../core/input';
import { CONTROLS } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { ControlSettings } from '../save/storage';
import { button, el, setText } from './dom';
import { radioGroup, rangeRow } from './form-controls';

/** Teclas que activan el botón enfocado (al soltarse o al pulsarse). */
const REPRESS_CODES: ReadonlySet<string> = new Set(['Space', 'Enter', 'NumpadEnter']);

interface Capture {
  action: BindableAction;
  slot: KeySlot;
  button: HTMLButtonElement;
}

/**
 * Pestaña de controles: dos teclas por acción (se cambian pulsando «Cambiar» y después la tecla nueva),
 * respuesta de la dirección con teclado y ajustes del stick del mando, más el mapa fijo del mando.
 *
 * Durante la captura de una tecla se escucha el teclado en fase de captura y se detiene la propagación para
 * que la tecla no active también una acción del juego (M silenciaría, Esc cerraría los ajustes). Solo se
 * bloquea la acción por defecto de las teclas permitidas; Tab sigue moviendo el foco (y cancela la captura).
 */
export class ControlsTab {
  readonly root: HTMLElement;
  private controls: ControlSettings | null = null;
  private readonly keyButtons = new Map<string, HTMLButtonElement>();
  private readonly status: HTMLElement;
  private readonly setSteer: (value: KeyboardSteerResponse) => void;
  private readonly setDeadzone: (value: number) => void;
  private readonly setSensitivity: (value: number) => void;
  private capture: Capture | null = null;
  /** Tecla cuya liberación hay que tragar (para que Espacio o Intro no vuelvan a pulsar el botón). */
  private swallowKeyUp: string | null = null;

  constructor(private readonly onChange: (controls: ControlSettings) => void) {
    this.status = el('p', { className: 'hint key-status', attrs: { role: 'status' } });
    const rows = BINDABLE_ACTIONS.map((action) => {
      const name = TEXTS.settings.actions[action];
      const cells: Node[] = [el('span', { className: 'key-action', text: name })];
      for (const slot of [0, 1] as const) {
        const b = button(
          TEXTS.settings.none,
          () => this.startCapture(action, slot, b),
          'btn key-btn',
        );
        b.addEventListener('blur', () => {
          if (this.capture?.button === b) this.cancelCapture(TEXTS.settings.captureCancelled);
        });
        this.keyButtons.set(`${action}:${slot}`, b);
        cells.push(b);
      }
      return el(
        'div',
        { className: 'key-row', attrs: { role: 'group', 'aria-label': name } },
        cells,
      );
    });

    const steer = radioGroup<KeyboardSteerResponse>(
      TEXTS.settings.keyboardSteer,
      'keyboard-steer',
      TEXTS.settings.keyboardSteerOptions,
      (keyboardSteer) => this.patch({ keyboardSteer }),
      TEXTS.settings.keyboardSteerHint,
    );
    const deadzone = rangeRow(
      {
        id: 'pad-deadzone-input',
        label: TEXTS.settings.padDeadzone,
        hint: TEXTS.settings.padDeadzoneHint,
        unit: TEXTS.settings.percentUnit,
        ...CONTROLS.padDeadzone,
      },
      (padDeadzone) => this.patch({ padDeadzone }),
    );
    const sensitivity = rangeRow(
      {
        id: 'pad-sensitivity-input',
        label: TEXTS.settings.padSensitivity,
        hint: TEXTS.settings.padSensitivityHint,
        unit: TEXTS.settings.percentUnit,
        ...CONTROLS.padSensitivity,
      },
      (padSensitivity) => this.patch({ padSensitivity }),
    );
    this.setSteer = steer.set;
    this.setDeadzone = deadzone.set;
    this.setSensitivity = sensitivity.set;

    const padMap = el(
      'dl',
      { className: 'pad-map' },
      TEXTS.settings.padMap.flatMap(([buttonName, action]) => [
        el('dt', {}, [el('kbd', { text: buttonName })]),
        el('dd', { text: action }),
      ]),
    );

    this.root = el('div', { className: 'controls-tab' }, [
      el('h3', { text: TEXTS.settings.keyboardTitle }),
      el('small', { className: 'hint', text: TEXTS.settings.keyboardHint }),
      el('div', { className: 'key-head', attrs: { 'aria-hidden': 'true' } }, [
        el('span'),
        el('span', { text: TEXTS.settings.keyPrimary }),
        el('span', { text: TEXTS.settings.keySecondary }),
      ]),
      el('div', { className: 'key-table' }, rows),
      this.status,
      steer.root,
      el('h3', { text: TEXTS.settings.padTitle }),
      deadzone.root,
      sensitivity.root,
      el('h4', { text: TEXTS.settings.padMapTitle }),
      padMap,
    ]);

    window.addEventListener('keydown', (event) => this.onKeyDown(event), true);
    window.addEventListener('keyup', (event) => this.onKeyUp(event), true);
    // Si la liberación no llega (se sale de la ventana con la tecla pulsada), no se traga la siguiente:
    // si no, esa tecla podría quedarse «pulsada» durante la carrera.
    window.addEventListener('blur', () => (this.swallowKeyUp = null));
  }

  /** Muestra los controles actuales. */
  sync(controls: ControlSettings): void {
    this.controls = controls;
    this.cancelCapture(null);
    for (const action of BINDABLE_ACTIONS) {
      for (const slot of [0, 1] as const) {
        const b = this.keyButtons.get(`${action}:${slot}`);
        if (b) this.paint(b, action, slot);
      }
    }
    this.setSteer(controls.keyboardSteer);
    this.setDeadzone(controls.padDeadzone);
    this.setSensitivity(controls.padSensitivity);
  }

  /** Anuncia un mensaje en la zona de estado (lector de pantalla y texto visible). */
  announce(text: string): void {
    setText(this.status, text);
  }

  /** Al cerrar la ventana: cancela la captura y deja de esperar la liberación de una tecla. */
  close(): void {
    this.cancelCapture(null);
    this.swallowKeyUp = null;
  }

  /** Cancela la captura en curso. */
  cancelCapture(message: string | null = null): void {
    const capture = this.capture;
    if (!capture) return;
    this.capture = null;
    capture.button.classList.remove('is-capturing');
    this.paint(capture.button, capture.action, capture.slot);
    if (message !== null) this.announce(message);
  }

  /** Texto y nombre accesible del botón de un hueco con su tecla actual. */
  private paint(b: HTMLButtonElement, action: BindableAction, slot: KeySlot): void {
    const code = this.controls?.keys[action][slot] ?? null;
    const label = code === null ? TEXTS.settings.none : keyLabel(code);
    setText(b, label);
    const slotName = slot === 0 ? TEXTS.settings.keyPrimary : TEXTS.settings.keySecondary;
    b.setAttribute(
      'aria-label',
      `${TEXTS.settings.actions[action]}, ${slotName}: ${label}. ${TEXTS.settings.change}`,
    );
  }

  private patch(patch: Partial<ControlSettings>): void {
    if (!this.controls) return;
    this.controls = { ...this.controls, ...patch };
    this.onChange(this.controls);
  }

  private startCapture(action: BindableAction, slot: KeySlot, b: HTMLButtonElement): void {
    if (this.capture?.button === b) return;
    this.cancelCapture(null);
    this.capture = { action, slot, button: b };
    b.classList.add('is-capturing');
    setText(b, TEXTS.settings.capturing);
    const prompt = TEXTS.settings.capturePrompt(TEXTS.settings.actions[action]);
    b.setAttribute('aria-label', prompt);
    this.announce(prompt);
  }

  private onKeyDown(event: KeyboardEvent): void {
    const capture = this.capture;
    if (!capture || !this.controls) return;
    // Tab mueve el foco (y la pérdida de foco cancela); los atajos con modificadores son del navegador.
    if (event.code === 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    event.stopPropagation();
    if (event.repeat) return;
    if (event.code === 'Escape') {
      this.cancelCapture(TEXTS.settings.captureCancelled);
      return;
    }
    let result: AssignResult;
    if (event.code === 'Delete') {
      event.preventDefault();
      result = clearKey(this.controls.keys, capture.action, capture.slot);
    } else {
      result = assignKey(this.controls.keys, capture.action, capture.slot, event.code);
      // Solo Espacio e Intro volverían a pulsar el botón enfocado: son las únicas cuya acción por defecto se
      // bloquea (y cuya liberación se traga). El resto de teclas conserva su comportamiento normal.
      if ((result.ok || result.reason === 'lastKey') && REPRESS_CODES.has(event.code)) {
        event.preventDefault();
        this.swallowKeyUp = event.code;
      }
    }
    if (!result.ok) {
      this.announce(
        result.reason === 'notAllowed'
          ? TEXTS.settings.keyNotAllowed
          : TEXTS.settings.keyLastOne(TEXTS.settings.actions[result.action ?? capture.action]),
      );
      return;
    }
    const action = TEXTS.settings.actions[capture.action];
    const message =
      event.code === 'Delete'
        ? TEXTS.settings.keyCleared(action)
        : TEXTS.settings.keyAssigned(keyLabel(event.code), action);
    const moved = result.moved;
    this.capture = null;
    capture.button.classList.remove('is-capturing');
    this.patch({ keys: result.map });
    if (this.controls) this.sync(this.controls);
    this.announce(
      moved && moved.action !== capture.action
        ? `${message} ${TEXTS.settings.keyMoved(keyLabel(event.code), TEXTS.settings.actions[moved.action])}`
        : message,
    );
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (this.swallowKeyUp === null || event.code !== this.swallowKeyUp) return;
    this.swallowKeyUp = null;
    event.preventDefault();
    event.stopPropagation();
  }
}
