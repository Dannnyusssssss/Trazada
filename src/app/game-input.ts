import { mergeControls, padToControls, PadButtons } from '../core/gamepad';
import { createControls, InputState, type Action } from '../core/input';
import { GamepadReader } from '../ui/gamepad';

/**
 * Entrada del jugador: teclado y mando combinados en unos controles únicos para cada paso de simulación,
 * más los botones de un disparo del mando (pausa, cámara, silencio, reaparecer).
 */
export class GameInput {
  /** Estado del teclado (lo alimenta `attachKeyboard`). */
  readonly keyboard = new InputState();
  private readonly keyboardControls = createControls();
  private readonly padControls = createControls();
  /** Controles combinados del último paso. */
  readonly controls = createControls();
  private readonly gamepad = new GamepadReader();
  private readonly padButtons = new PadButtons();
  private readonly padActions: Action[] = [];
  private padRespawn = false;

  /** Lee el mando (solo si hay uno conectado) y reparte sus controles y sus botones de un disparo. */
  pollGamepad(driving: boolean, onAction: (action: Action, driving: boolean) => void): void {
    const pad = this.gamepad.active ? this.gamepad.poll() : null;
    if (!pad) {
      this.padControls.throttle = 0;
      this.padControls.brake = 0;
      this.padControls.steer = 0;
      this.padControls.handbrake = false;
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

  /** Prepara `controls` para un paso y devuelve si se pidió reaparecer (teclado o mando). */
  readStep(): boolean {
    this.keyboard.toControls(this.keyboardControls);
    mergeControls(this.keyboardControls, this.padControls, this.controls);
    const respawn = this.keyboard.consume('respawn') || this.padRespawn;
    this.padRespawn = false;
    return respawn;
  }

  /** Olvida las teclas pulsadas. */
  clearKeyboard(): void {
    this.keyboard.clear();
  }

  /** Olvida las teclas y los botones del mando (al empezar a conducir). */
  clearAll(): void {
    this.keyboard.clear();
    this.padButtons.clear();
  }
}
