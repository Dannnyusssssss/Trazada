import { mergeControls, padToControls, PadButtons } from '../core/gamepad';
import {
  createControls,
  InputState,
  resetControls,
  type Action,
  type CarControls,
} from '../core/input';
import { TouchState, type TouchOptions } from '../core/touch';
import { GamepadReader } from '../ui/gamepad';

/** Hay alguna orden de conducción en estos controles (para saber qué entrada usa el jugador). */
function isDriving(controls: CarControls): boolean {
  return controls.throttle > 0 || controls.brake > 0 || controls.steer !== 0 || controls.handbrake;
}

/**
 * Entrada del jugador: teclado, mando y pantalla táctil combinados en unos controles únicos para cada paso
 * de simulación, más los botones de un disparo (pausa, cámara, silencio, reaparecer).
 *
 * La pantalla táctil solo cuenta en «modo táctil», que empieza al tocar los controles de la pantalla y
 * termina en cuanto se conduce con el teclado o el mando. Así la aceleración automática no deja pisado el
 * acelerador a quien juega con teclado en un equipo con pantalla táctil.
 */
export class GameInput {
  /** Estado del teclado (lo alimenta `attachKeyboard`). */
  readonly keyboard = new InputState();
  /** Estado de la pantalla táctil (lo alimenta `TouchControls`). */
  readonly touch = new TouchState();
  private readonly keyboardControls = createControls();
  private readonly padControls = createControls();
  private readonly touchControls = createControls();
  private readonly mixed = createControls();
  /** Controles combinados del último paso. */
  readonly controls = createControls();
  private readonly gamepad = new GamepadReader();
  private readonly padButtons = new PadButtons();
  private readonly padActions: Action[] = [];
  private readonly touchActions: Action[] = [];
  private padRespawn = false;
  private touchRespawn = false;
  private touchMode = false;
  private readonly touchOptions: TouchOptions = { autoThrottle: true };

  /** El jugador tocó la pantalla (en un menú o en los controles): pasa a modo táctil. */
  noteTouch(): void {
    this.touchMode = true;
  }

  /** Activa o desactiva la aceleración automática táctil. */
  setAutoThrottle(enabled: boolean): void {
    this.touchOptions.autoThrottle = enabled;
  }

  /** Lee el mando (solo si hay uno conectado) y reparte sus controles y sus botones de un disparo. */
  pollGamepad(driving: boolean, onAction: (action: Action, driving: boolean) => void): void {
    const pad = this.gamepad.active ? this.gamepad.poll() : null;
    if (!pad) {
      resetControls(this.padControls);
      return;
    }
    padToControls(pad, this.padControls);
    for (const action of this.padButtons.update(pad, this.padActions)) {
      if (action === 'respawn') {
        if (driving) this.padRespawn = true;
      } else {
        onAction(action, driving);
      }
    }
  }

  /** Reparte los botones de un disparo de la pantalla táctil. */
  pollTouch(driving: boolean, onAction: (action: Action, driving: boolean) => void): void {
    if (this.touch.activePointers > 0) this.touchMode = true;
    for (const action of this.touch.consumeActions(this.touchActions)) {
      if (action === 'respawn') {
        if (driving) this.touchRespawn = true;
      } else {
        onAction(action, driving);
      }
    }
  }

  /** Prepara `controls` para un paso y devuelve si se pidió reaparecer (teclado, mando o pantalla). */
  readStep(): boolean {
    this.keyboard.toControls(this.keyboardControls);
    if (isDriving(this.keyboardControls) || isDriving(this.padControls)) this.touchMode = false;
    else if (this.touch.activePointers > 0) this.touchMode = true;
    if (this.touchMode) this.touch.toControls(this.touchControls, this.touchOptions);
    else resetControls(this.touchControls);
    mergeControls(this.keyboardControls, this.padControls, this.mixed);
    mergeControls(this.mixed, this.touchControls, this.controls);
    const respawn = this.keyboard.consume('respawn') || this.padRespawn || this.touchRespawn;
    this.padRespawn = false;
    this.touchRespawn = false;
    return respawn;
  }

  /** Olvida las teclas pulsadas. */
  clearKeyboard(): void {
    this.keyboard.clear();
  }

  /** Olvida las teclas, los botones del mando y los dedos (al empezar a conducir). */
  clearAll(): void {
    this.keyboard.clear();
    this.padButtons.clear();
    this.touch.releaseAll();
  }
}
