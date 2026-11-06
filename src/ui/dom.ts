/**
 * Ayudas para crear la interfaz con nodos del DOM y `textContent` (nunca innerHTML).
 */

export interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly Node[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

/** Cambia el texto solo si es distinto (evita trabajo de maquetación innecesario en cada frame). */
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function button(text: string, onClick: () => void, className = 'btn'): HTMLButtonElement {
  const b = el('button', { className, text, attrs: { type: 'button' } });
  b.addEventListener('click', onClick);
  return b;
}

export function setVisible(node: HTMLElement, visible: boolean): void {
  node.hidden = !visible;
}

/** Interruptor accesible (casilla con su etiqueta). */
export function toggle(
  label: string,
  checked: boolean,
  onChange: (value: boolean) => void,
  hint?: string,
): { root: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { attrs: { type: 'checkbox' } });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const children: Node[] = [input, el('span', { text: label })];
  const root = el('label', { className: 'toggle' }, children);
  if (hint) root.appendChild(el('small', { className: 'hint', text: hint }));
  return { root, input };
}
