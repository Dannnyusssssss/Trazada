import { el, setText } from './dom';

/**
 * Controles de formulario de los ajustes (sin `<form>`: el sandbox del portal no tiene `allow-forms`).
 * Todos con nodos y `textContent`.
 */

/** Grupo de botones de opción nativo (las flechas cambian la opción). */
export function radioGroup<T extends string>(
  legend: string,
  name: string,
  options: Readonly<Record<T, string>>,
  onChange: (value: T) => void,
  hint: string,
): { root: HTMLElement; set: (value: T) => void } {
  const inputs = new Map<T, HTMLInputElement>();
  const root = el('fieldset', { className: 'radio-row' }, [el('legend', { text: legend })]);
  for (const [value, label] of Object.entries(options) as [T, string][]) {
    const input = el('input', { attrs: { type: 'radio', name, value } });
    input.addEventListener('change', () => {
      if (input.checked) onChange(value);
    });
    inputs.set(value, input);
    root.appendChild(el('label', { className: 'radio' }, [input, el('span', { text: label })]));
  }
  root.appendChild(el('small', { className: 'hint', text: hint }));
  const set = (value: T): void => {
    const input = inputs.get(value);
    if (input) input.checked = true;
  };
  return { root, set };
}

export interface RangeOptions {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  hint?: string;
}

/**
 * Barra deslizante con su etiqueta y su valor visible. `onInput` recibe el valor ya redondeado al paso y
 * recortado al rango (el valor del DOM puede venir manipulado).
 */
export function rangeRow(
  options: RangeOptions,
  onInput: (value: number) => void,
): { root: HTMLElement; set: (value: number) => void } {
  const input = el('input', {
    attrs: {
      type: 'range',
      min: String(options.min),
      max: String(options.max),
      step: String(options.step),
      id: options.id,
    },
  });
  const output = el('output', { attrs: { for: options.id } });
  const show = (value: number): void => setText(output, `${value}${options.unit}`);
  input.addEventListener('input', () => {
    const raw = Number(input.value);
    const stepped = Number.isFinite(raw)
      ? Math.round((raw - options.min) / options.step) * options.step + options.min
      : options.min;
    const value = Math.min(options.max, Math.max(options.min, stepped));
    show(value);
    onInput(value);
  });
  const row = el('div', { className: 'range' }, [
    el('label', { text: options.label, attrs: { for: options.id } }),
    input,
    output,
  ]);
  const root = options.hint
    ? el('div', { className: 'range-group' }, [
        row,
        el('small', { className: 'hint', text: options.hint }),
      ])
    : row;
  const set = (value: number): void => {
    input.value = String(value);
    show(value);
  };
  return { root, set };
}
