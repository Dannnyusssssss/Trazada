import type { GamepadSnapshot } from '../core/gamepad';

/**
 * Adaptador de la Gamepad API. No consulta nada hasta que el navegador avisa de que hay un mando conectado
 * (evento `gamepadconnected`), así que sin mando no gasta CPU. Reutiliza los arreglos de la lectura.
 */
export class GamepadReader {
  private connected = 0;
  private readonly axes: number[] = [];
  private readonly buttons: number[] = [];
  private readonly snapshot: GamepadSnapshot = { axes: this.axes, buttons: this.buttons };

  constructor() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    window.addEventListener('gamepadconnected', () => {
      this.connected++;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.connected = Math.max(0, this.connected - 1);
    });
  }

  get active(): boolean {
    return this.connected > 0;
  }

  /** Lee el primer mando conectado, o devuelve null si no hay ninguno. */
  poll(): GamepadSnapshot | null {
    if (this.connected === 0) return null;
    let pads: (Gamepad | null)[];
    try {
      pads = navigator.getGamepads();
    } catch {
      // La política de permisos del documento puede bloquear la API: el juego sigue con teclado.
      this.connected = 0;
      return null;
    }
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      this.axes.length = pad.axes.length;
      for (let i = 0; i < pad.axes.length; i++) this.axes[i] = pad.axes[i] ?? 0;
      this.buttons.length = pad.buttons.length;
      for (let i = 0; i < pad.buttons.length; i++) this.buttons[i] = pad.buttons[i]?.value ?? 0;
      return this.snapshot;
    }
    return null;
  }
}
