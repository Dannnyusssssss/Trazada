import { shouldPreventDefault, type Action, type InputState } from '../core/input';

export interface KeyboardHandlers {
  /** true mientras se conduce (cuenta atrás o carrera, sin menús abiertos). */
  isDriving: () => boolean;
  /** Acción de un disparo (pausa, silencio, cámara). `driving` indica si se estaba conduciendo. */
  onAction: (action: Action, driving: boolean) => void;
  /** F2: muestra u oculta el panel de métricas (tecla fija; no se bloquea su acción por defecto). */
  onToggleMetrics: () => void;
}

/** Tecla fija del panel de métricas. F3 no sirve: abre «Buscar» en los navegadores. */
export const METRICS_KEY = 'F2';

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
    if (event.code === METRICS_KEY) {
      if (!event.repeat) handlers.onToggleMetrics();
      return;
    }
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
    // En los menús solo cuentan pausa (Esc o su tecla configurada) y silencio.
    const action = input.actionFor(event.code);
    if (action === 'pause' || action === 'mute') handlers.onAction(action, false);
  });
  window.addEventListener('keyup', (event) => {
    input.keyUp(event.code);
  });
  // Al perder el foco se sueltan todas las teclas para que el coche no siga acelerando solo.
  window.addEventListener('blur', () => input.clear());
}
