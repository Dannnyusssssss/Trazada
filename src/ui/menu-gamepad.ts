import type { MenuCommand } from '../core/menu-nav';

/**
 * Adaptador DOM de la navegación con el mando: aplica un comando de menú al contenedor visible moviendo el
 * foco, ajustando controles o pulsando el elemento enfocado.
 */

export interface MenuGamepadHooks {
  onBack: () => void;
  /** Cambia de pestaña; devuelve true si había pestañas. */
  onTab: (delta: 1 | -1) => boolean;
}

/** Lo que se puede enfocar con Tab; las pestañas inactivas (tabindex -1) se saltan, como con el teclado. */
const FOCUSABLE =
  'button:not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), [tabindex="0"]';

function isUsable(node: HTMLElement): boolean {
  if ((node as HTMLButtonElement).disabled) return false;
  return node.getClientRects().length > 0;
}

/** Elementos enfocables visibles; de cada grupo de radios solo cuenta el marcado (o el primero). */
function collectFocusable(container: HTMLElement): HTMLElement[] {
  const all = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isUsable);
  const groups = new Map<string, HTMLInputElement>();
  for (const node of all) {
    if (!(node instanceof HTMLInputElement) || node.type !== 'radio' || node.name === '') continue;
    const current = groups.get(node.name);
    if (!current || (node.checked && !current.checked)) groups.set(node.name, node);
  }
  return all.filter((node) => {
    if (!(node instanceof HTMLInputElement) || node.type !== 'radio' || node.name === '')
      return true;
    return groups.get(node.name) === node;
  });
}

function focusNode(node: HTMLElement): void {
  node.focus({ preventScroll: false });
  node.scrollIntoView({ block: 'nearest' });
}

function moveFocus(items: readonly HTMLElement[], current: HTMLElement, delta: 1 | -1): void {
  const index = items.indexOf(current);
  const target = items[index + delta];
  if (target) focusNode(target);
}

function stepRadio(container: HTMLElement, radio: HTMLInputElement, delta: 1 | -1): void {
  const group = Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).filter((r) => r.name === radio.name && isUsable(r));
  const start = group.indexOf(radio);
  if (start < 0 || group.length < 2) return;
  const next = group[(start + delta + group.length) % group.length];
  if (!next || next === radio) return;
  next.checked = true;
  focusNode(next);
  next.dispatchEvent(new Event('change', { bubbles: true }));
}

export function applyMenuCommand(
  container: HTMLElement,
  command: MenuCommand,
  hooks: MenuGamepadHooks,
): void {
  if (command === 'back') {
    hooks.onBack();
    return;
  }
  if (command === 'tabPrev' || command === 'tabNext') {
    hooks.onTab(command === 'tabNext' ? 1 : -1);
    return;
  }

  const items = collectFocusable(container);
  const active = document.activeElement;
  const current = active instanceof HTMLElement && container.contains(active) ? active : null;
  if (!current) {
    const first = items[0];
    if (first) focusNode(first);
    return;
  }

  if (command === 'accept') {
    current.click();
    return;
  }

  const delta: 1 | -1 = command === 'up' || command === 'left' ? -1 : 1;
  if (command === 'up' || command === 'down') {
    moveFocus(items, current, delta);
    return;
  }

  // Izquierda y derecha: dependen del tipo de control enfocado.
  if (current instanceof HTMLInputElement && current.type === 'range') {
    if (delta === 1) current.stepUp();
    else current.stepDown();
    current.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (current instanceof HTMLInputElement && current.type === 'radio') {
    stepRadio(container, current, delta);
  } else if (current.getAttribute('role') === 'tab') {
    hooks.onTab(delta);
  } else {
    moveFocus(items, current, delta);
  }
}
