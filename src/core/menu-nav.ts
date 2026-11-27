import { PRESS_THRESHOLD, type GamepadSnapshot } from './gamepad';

/**
 * Navegación de menús con el mando como lógica pura: traduce lecturas del mando (distribución estándar) a
 * comandos de menú por flanco, con repetición al mantener las direcciones. El adaptador DOM vive en
 * src/ui/menu-gamepad.ts.
 */

export type MenuCommand =
  'up' | 'down' | 'left' | 'right' | 'accept' | 'back' | 'tabPrev' | 'tabNext';

/** Comandos en el orden de sus índices internos; los cuatro primeros son direcciones con repetición. */
const COMMANDS: readonly MenuCommand[] = [
  'up',
  'down',
  'left',
  'right',
  'accept',
  'back',
  'tabPrev',
  'tabNext',
];
const DIRECTIONS = 4;
const UP = 0;
const DOWN = 1;
const LEFT = 2;
const RIGHT = 3;

/** Botón de la distribución estándar de cada comando (mismo orden que COMMANDS). */
const BUTTONS: readonly number[] = [12, 13, 14, 15, 0, 1, 4, 5];

/** Eje del stick izquierdo. */
const AXIS_X = 0;
const AXIS_Y = 1;

/** Espera hasta la primera repetición y entre repeticiones, en segundos. */
export const REPEAT_DELAY = 0.4;
export const REPEAT_INTERVAL = 0.12;

function finiteOr0(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

export class MenuPad {
  private readonly down: boolean[] = new Array<boolean>(COMMANDS.length).fill(false);
  private readonly now: boolean[] = new Array<boolean>(COMMANDS.length).fill(false);
  private readonly timers: number[] = new Array<number>(DIRECTIONS).fill(0);
  private primed = false;

  /** Lee el mando; escribe en `out` (vaciándolo antes) los comandos de esta lectura y lo devuelve. */
  update(pad: GamepadSnapshot, dt: number, out: MenuCommand[]): MenuCommand[] {
    out.length = 0;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const now = this.now;

    for (let i = 0; i < COMMANDS.length; i++) {
      now[i] = finiteOr0(pad.buttons[BUTTONS[i] ?? 0]) > PRESS_THRESHOLD;
    }
    // Stick como dirección: solo cuenta el eje de mayor magnitud.
    const x = finiteOr0(pad.axes[AXIS_X]);
    const y = finiteOr0(pad.axes[AXIS_Y]);
    if (Math.abs(x) >= Math.abs(y)) {
      if (x > PRESS_THRESHOLD) now[RIGHT] = true;
      else if (x < -PRESS_THRESHOLD) now[LEFT] = true;
    } else if (y > PRESS_THRESHOLD) now[DOWN] = true;
    else if (y < -PRESS_THRESHOLD) now[UP] = true;

    if (!this.primed) {
      // Primera lectura: lo que ya estaba pulsado no dispara hasta soltarlo.
      this.primed = true;
      for (let i = 0; i < COMMANDS.length; i++) {
        this.down[i] = now[i] ?? false;
        if (i < DIRECTIONS) this.timers[i] = REPEAT_DELAY;
      }
      return out;
    }

    for (let i = 0; i < COMMANDS.length; i++) {
      const command = COMMANDS[i] as MenuCommand;
      if (!now[i]) {
        this.down[i] = false;
        continue;
      }
      if (!this.down[i]) {
        this.down[i] = true;
        out.push(command);
        if (i < DIRECTIONS) this.timers[i] = REPEAT_DELAY;
      } else if (i < DIRECTIONS) {
        let t = (this.timers[i] ?? REPEAT_DELAY) - step;
        if (t <= 0) {
          out.push(command);
          t += REPEAT_INTERVAL;
          if (t <= 0) t = REPEAT_INTERVAL;
        }
        this.timers[i] = t;
      }
    }
    return out;
  }

  /** Olvida lo pulsado: un botón que siga pulsado no dispara hasta soltarlo. */
  clear(): void {
    this.primed = false;
    this.down.fill(false);
    this.timers.fill(0);
  }
}
