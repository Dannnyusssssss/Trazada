import type { Action } from './input';
import { TEXTS } from '../data/texts';

/**
 * Teclas configurables como lógica pura: mapa acción -> dos teclas, lista blanca de códigos permitidos,
 * validación del guardado y reasignación con intercambio. Escape no forma parte del mapa: es pausa fija.
 */

export type BindableAction = Exclude<Action, never>;

export const BINDABLE_ACTIONS: readonly BindableAction[] = [
  'throttle',
  'brake',
  'left',
  'right',
  'handbrake',
  'respawn',
  'camera',
  'pause',
  'mute',
];

/** Acciones sin las que no se puede conducir: nunca pueden quedarse sin tecla. */
export const DRIVING_ACTIONS: readonly BindableAction[] = ['throttle', 'brake', 'left', 'right'];

export type KeySlot = 0 | 1;

export type KeyMap = Readonly<Record<BindableAction, readonly [string | null, string | null]>>;

type MutableKeyMap = Record<BindableAction, [string | null, string | null]>;

export const DEFAULT_KEY_MAP: KeyMap = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space', null],
  respawn: ['KeyR', null],
  camera: ['KeyC', null],
  pause: ['KeyP', null],
  mute: ['KeyM', null],
};

/** Copia nueva del mapa de fábrica (nunca comparte arrays con la constante). */
export function createDefaultKeyMap(): KeyMap {
  return cloneMap(DEFAULT_KEY_MAP);
}

function cloneMap(map: KeyMap): MutableKeyMap {
  const out = {} as MutableKeyMap;
  for (const action of BINDABLE_ACTIONS) {
    const [a, b] = map[action];
    out[action] = [a, b];
  }
  return out;
}

/** Códigos permitidos. Quedan fuera Tab, Esc, F1–F12, Ctrl/Alt/Meta, Bloq Mayús y las teclas con acción del navegador. */
const BINDABLE_CODES: ReadonlySet<string> = (() => {
  const set = new Set<string>();
  for (let i = 0; i < 26; i++) set.add('Key' + String.fromCharCode(65 + i));
  for (let i = 0; i < 10; i++) {
    set.add('Digit' + i);
    set.add('Numpad' + i);
  }
  for (const code of [
    'NumpadAdd',
    'NumpadSubtract',
    'NumpadMultiply',
    'NumpadDecimal',
    'NumpadEnter',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'ShiftLeft',
    'ShiftRight',
    'Enter',
    'Comma',
    'Period',
  ]) {
    set.add(code);
  }
  return set;
})();

export function isBindableCode(code: string): boolean {
  return typeof code === 'string' && BINDABLE_CODES.has(code);
}

const MAX_CODE_LENGTH = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Si el hueco 0 está vacío y el 1 no, sube la tecla al hueco 0. */
function normalize(map: MutableKeyMap): void {
  for (const action of BINDABLE_ACTIONS) {
    const pair = map[action];
    if (pair[0] === null && pair[1] !== null) {
      pair[0] = pair[1];
      pair[1] = null;
    }
  }
}

function drivingActionWithoutKeys(map: MutableKeyMap): BindableAction | null {
  for (const action of DRIVING_ACTIONS) {
    const [a, b] = map[action];
    if (a === null && b === null) return action;
  }
  return null;
}

/**
 * Valida un mapa leído del guardado (datos manipulables). Devuelve null ante cualquier fallo: quien
 * llama debe usar entonces el mapa de fábrica.
 */
export function parseKeyMap(raw: unknown): KeyMap | null {
  if (!isPlainObject(raw)) return null;
  const out = {} as MutableKeyMap;
  const seen = new Set<string>();
  for (const action of BINDABLE_ACTIONS) {
    if (!Object.prototype.hasOwnProperty.call(raw, action)) return null;
    const pair = raw[action];
    if (!Array.isArray(pair) || pair.length !== 2) return null;
    const entries: (string | null)[] = [];
    for (let i = 0; i < 2; i++) {
      const value: unknown = pair[i];
      if (value === null) {
        entries.push(null);
        continue;
      }
      if (typeof value !== 'string' || value.length > MAX_CODE_LENGTH || !isBindableCode(value)) {
        return null;
      }
      if (seen.has(value)) return null;
      seen.add(value);
      entries.push(value);
    }
    out[action] = [entries[0] ?? null, entries[1] ?? null];
  }
  normalize(out);
  if (drivingActionWithoutKeys(out) !== null) return null;
  return out;
}

export type AssignResult =
  | { ok: true; map: KeyMap; moved: { action: BindableAction; slot: KeySlot } | null }
  | { ok: false; reason: 'notAllowed' | 'lastKey'; action?: BindableAction };

/**
 * Asigna `code` al hueco indicado. Si la tecla ya la usaba otro hueco, se intercambian: ese hueco recibe
 * la tecla que había antes (o queda vacío). No muta el mapa recibido.
 */
export function assignKey(
  map: KeyMap,
  action: BindableAction,
  slot: KeySlot,
  code: string,
): AssignResult {
  if (!isBindableCode(code)) return { ok: false, reason: 'notAllowed' };
  if (map[action][slot] === code) return { ok: true, map, moved: null };

  const next = cloneMap(map);
  let moved: { action: BindableAction; slot: KeySlot } | null = null;
  const previous = next[action][slot];
  for (const other of BINDABLE_ACTIONS) {
    for (const s of [0, 1] as const) {
      if (next[other][s] === code) {
        next[other][s] = previous;
        moved = { action: other, slot: s };
      }
    }
  }
  next[action][slot] = code;
  const empty = drivingActionWithoutKeys(next);
  if (empty !== null) return { ok: false, reason: 'lastKey', action: empty };
  normalize(next);
  return { ok: true, map: next, moved };
}

/** Quita la tecla de un hueco. Una acción de conducción no puede quedarse sin ninguna. */
export function clearKey(map: KeyMap, action: BindableAction, slot: KeySlot): AssignResult {
  const next = cloneMap(map);
  next[action][slot] = null;
  const empty = drivingActionWithoutKeys(next);
  if (empty !== null) return { ok: false, reason: 'lastKey', action: empty };
  normalize(next);
  return { ok: true, map: next, moved: null };
}

/** Nombre corto de una tecla para mostrarlo al jugador. */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return TEXTS.keys.numpadPrefix + code.slice(6);
  if (code !== 'numpadPrefix' && Object.prototype.hasOwnProperty.call(TEXTS.keys, code)) {
    return (TEXTS.keys as Readonly<Record<string, string>>)[code] ?? code;
  }
  return code;
}

export function keyMapsEqual(a: KeyMap, b: KeyMap): boolean {
  for (const action of BINDABLE_ACTIONS) {
    if (a[action][0] !== b[action][0] || a[action][1] !== b[action][1]) return false;
  }
  return true;
}

/**
 * Teclas de una acción para mostrarlas (p. ej. «W / ↑»). Si la acción es la pausa, Esc va siempre primero
 * porque es fija. Sin teclas devuelve `empty`.
 */
export function actionKeysLabel(map: KeyMap, action: BindableAction, empty = '—'): string {
  const labels: string[] = action === 'pause' ? [keyLabel('Escape')] : [];
  for (const code of map[action]) if (code !== null) labels.push(keyLabel(code));
  return labels.length > 0 ? labels.join(' / ') : empty;
}
