import { shouldPreventDefault, type Action, type InputState } from '../core/input';

export interface KeyboardHandlers {
  /** true mientras se conduce (cuenta atrás o carrera, sin menús abiertos). */
  isDriving: () => boolean;
  /** Acción de un disparo (pausa, silencio, cámara). `driving` indica si se estaba conduciendo. */
  onAction: (action: Action, driving: boolean) => void;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Adaptador entre el teclado del navegador y InputState. Solo bloquea la acción por defecto de flechas
 * y espacio mientras se conduce; Tab y Esc no se bloquean nunca, así se puede salir del foco del juego.
 */
export function attachKeyboard(input: InputState, handlers: KeyboardHandlers): void {
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const driving = handlers.isDriving();
    // En campos de ajustes o de depuración las teclas son para el campo (salvo Esc en los menús).
    if (isEditable(event.target) && !(event.code === 'Escape' && !driving)) return;
    if (driving) {
      const action = input.keyDown(event.code, event.repeat);
      if (action === null) return;
      if (shouldPreventDefault(event.code)) event.preventDefault();
      if (!event.repeat && (action === 'pause' || action === 'mute' || action === 'camera')) {
        input.discard(action);
        handlers.onAction(action, true);
      }
      return;
    }
    if (event.repeat) return;
    if (event.code === 'Escape' || event.code === 'KeyP') handlers.onAction('pause', false);
    else if (event.code === 'KeyM') handlers.onAction('mute', false);
  });
  window.addEventListener('keyup', (event) => {
    input.keyUp(event.code);
  });
  // Al perder el foco se sueltan todas las teclas para que el coche no siga acelerando solo.
  window.addEventListener('blur', () => input.clear());
}
