import {
  mergeControls,
  padToControls,
  PadButtons,
  padTuningFromPercent,
  type GamepadSnapshot,
} from '../core/gamepad';
import {
  createControls,
  InputState,
  resetControls,
  smoothSteer,
  type Action,
  type CarControls,
  type KeyboardSteerResponse,
} from '../core/input';
import { MenuPad, type MenuCommand } from '../core/menu-nav';
import { CONTROLS, STEP_SECONDS } from '../data/balance';
import type { ControlSettings } from '../save/storage';
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
  /** Ajustes de entrada del jugador (respuesta del teclado y stick). */
  private steerResponse: KeyboardSteerResponse = 'direct';
  private padTuning = padTuningFromPercent(
    CONTROLS.padDeadzone.default,
    CONTROLS.padSensitivity.default,
  );
  /** Dirección suavizada del teclado (estado entre pasos). */
  private keyboardSteer = 0;
  /** Última lectura del mando y navegación de menús con él. */
  private lastPad: GamepadSnapshot | null = null;
  private readonly menuPad = new MenuPad();
  private readonly menuCommands: MenuCommand[] = [];

  /** Aplica las teclas configuradas, la respuesta de la dirección con teclado y los ajustes del stick. */
  setControls(controls: ControlSettings): void {
    this.keyboard.setKeyMap(controls.keys);
    this.steerResponse = controls.keyboardSteer;
    this.padTuning = padTuningFromPercent(controls.padDeadzone, controls.padSensitivity);
  }

  /** Comandos de menú del mando en este frame (solo fuera de la conducción). */
  pollMenu(dt: number, onCommand: (command: MenuCommand) => void): void {
    const pad = this.lastPad;
    if (!pad) return;
    for (const command of this.menuPad.update(pad, dt, this.menuCommands)) onCommand(command);
  }

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
    this.lastPad = pad;
    if (!pad) {
      resetControls(this.padControls);
      return;
    }
    padToControls(pad, this.padControls, this.padTuning);
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
    // El suavizado solo cambia cómo llega la dirección del teclado; la física del coche es la misma.
    this.keyboardSteer = smoothSteer(
      this.keyboardSteer,
      this.keyboardControls.steer,
      this.steerResponse,
      STEP_SECONDS,
    );
    this.keyboardControls.steer = this.keyboardSteer;
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
    this.keyboardSteer = 0;
  }

  /** Olvida las teclas, los botones del mando y los dedos (al empezar a conducir). */
  clearAll(): void {
    this.keyboard.clear();
    this.keyboardSteer = 0;
    this.padButtons.clear();
    this.menuPad.clear();
    this.touch.releaseAll();
  }
}
