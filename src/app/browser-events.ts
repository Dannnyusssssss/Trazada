import type { InputState } from '../core/input';
import { attachKeyboard, type KeyboardHandlers } from '../ui/keyboard';

/** Lo que la aplicación hace ante los eventos del navegador. */
export interface BrowserEventHandlers extends KeyboardHandlers {
  /** Primer gesto del jugador: ya se puede arrancar el audio. */
  unlockAudio: () => void;
  /** La ventana perdió el foco o la pestaña se ocultó. */
  onFocusLost: () => void;
}

/** Conecta el teclado, el desbloqueo del audio, la pausa por foco y el foco del área de juego. */
export function attachBrowserEvents(
  gameElement: HTMLElement,
  keyboard: InputState,
  handlers: BrowserEventHandlers,
): void {
  attachKeyboard(keyboard, handlers);
  // El audio solo puede empezar tras un gesto del jugador (política de reproducción automática).
  const unlockAudio = (): void => handlers.unlockAudio();
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  window.addEventListener('keydown', unlockAudio, { capture: true });
  // Pausa automática al perder el foco o al ocultarse la pestaña.
  window.addEventListener('blur', () => handlers.onFocusLost());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handlers.onFocusLost();
  });
  // Un clic en el área de juego le devuelve el foco del teclado.
  gameElement.addEventListener('pointerdown', () => gameElement.focus({ preventScroll: true }));
}
