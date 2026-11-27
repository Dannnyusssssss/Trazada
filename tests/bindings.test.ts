import { describe, expect, it } from 'vitest';
import {
  BINDABLE_ACTIONS,
  actionKeysLabel,
  DEFAULT_KEY_MAP,
  DRIVING_ACTIONS,
  assignKey,
  clearKey,
  createDefaultKeyMap,
  isBindableCode,
  keyLabel,
  keyMapsEqual,
  parseKeyMap,
  type KeyMap,
} from '../src/core/bindings';

function raw(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(DEFAULT_KEY_MAP)) as Record<string, unknown>;
}

describe('lista blanca de teclas', () => {
  it('permite letras, dígitos, teclado numérico, flechas y similares', () => {
    for (const code of [
      'KeyA',
      'KeyZ',
      'Digit0',
      'Digit9',
      'Numpad0',
      'Numpad9',
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
      expect(isBindableCode(code), code).toBe(true);
    }
  });

  it('rechaza teclas del navegador o del portal y entradas raras', () => {
    for (const code of [
      'Tab',
      'Escape',
      'F1',
      'F2',
      'F3',
      'F12',
      'ControlLeft',
      'AltLeft',
      'MetaLeft',
      'CapsLock',
      'Backspace',
      'Slash',
      'Quote',
      'NumpadDivide',
      'Backquote',
      '',
      'keya',
      'KeyAA',
      'x'.repeat(100000),
    ]) {
      expect(isBindableCode(code), code.slice(0, 12)).toBe(false);
    }
  });
});

describe('mapa de fábrica', () => {
  it('cubre las 9 acciones y createDefaultKeyMap devuelve una copia', () => {
    expect(BINDABLE_ACTIONS).toHaveLength(9);
    const copy = createDefaultKeyMap();
    expect(keyMapsEqual(copy, DEFAULT_KEY_MAP)).toBe(true);
    expect(copy.throttle).not.toBe(DEFAULT_KEY_MAP.throttle);
  });
});

describe('parseKeyMap', () => {
  it('acepta el mapa de fábrica', () => {
    const parsed = parseKeyMap(raw());
    expect(parsed).not.toBeNull();
    expect(keyMapsEqual(parsed as KeyMap, DEFAULT_KEY_MAP)).toBe(true);
  });

  it('rechaza guardado anterior y tipos erróneos', () => {
    for (const bad of [undefined, null, 5, 'x', [], true]) expect(parseKeyMap(bad)).toBeNull();
    const a = raw();
    a['throttle'] = 'KeyW';
    expect(parseKeyMap(a)).toBeNull();
    const b = raw();
    b['throttle'] = [1, null];
    expect(parseKeyMap(b)).toBeNull();
  });

  it('rechaza acciones que faltan y arrays de longitud errónea', () => {
    const a = raw();
    delete a['mute'];
    expect(parseKeyMap(a)).toBeNull();
    const b = raw();
    b['mute'] = ['KeyM'];
    expect(parseKeyMap(b)).toBeNull();
    const c = raw();
    c['mute'] = ['KeyM', null, null];
    expect(parseKeyMap(c)).toBeNull();
  });

  it('rechaza duplicados, códigos prohibidos y cadenas largas', () => {
    const a = raw();
    a['camera'] = ['KeyW', null];
    expect(parseKeyMap(a)).toBeNull();
    const b = raw();
    b['camera'] = ['Tab', null];
    expect(parseKeyMap(b)).toBeNull();
    const c = raw();
    c['camera'] = ['Key' + 'A'.repeat(40), null];
    expect(parseKeyMap(c)).toBeNull();
  });

  it('rechaza una acción de conducción sin teclas', () => {
    const a = raw();
    a['brake'] = [null, null];
    expect(parseKeyMap(a)).toBeNull();
  });

  it('ignora claves extra y __proto__', () => {
    const text = JSON.stringify(DEFAULT_KEY_MAP).replace(
      '{',
      '{"__proto__":{"throttle":["KeyQ",null]},"extra":1,',
    );
    const parsed = parseKeyMap(JSON.parse(text));
    expect(parsed).not.toBeNull();
    expect(keyMapsEqual(parsed as KeyMap, DEFAULT_KEY_MAP)).toBe(true);
    expect(Object.keys(parsed as KeyMap)).toHaveLength(9);
  });

  it('normaliza el hueco vacío inicial', () => {
    const a = raw();
    a['camera'] = [null, 'KeyC'];
    const parsed = parseKeyMap(a);
    expect(parsed?.camera).toEqual(['KeyC', null]);
  });
});

describe('assignKey', () => {
  it('asigna una tecla libre sin mutar la entrada', () => {
    const before = JSON.stringify(DEFAULT_KEY_MAP);
    const r = assignKey(DEFAULT_KEY_MAP, 'camera', 1, 'KeyV');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.map.camera).toEqual(['KeyC', 'KeyV']);
      expect(r.moved).toBeNull();
    }
    expect(JSON.stringify(DEFAULT_KEY_MAP)).toBe(before);
  });

  it('rechaza teclas no permitidas', () => {
    expect(assignKey(DEFAULT_KEY_MAP, 'camera', 0, 'Tab')).toEqual({
      ok: false,
      reason: 'notAllowed',
    });
  });

  it('la misma tecla en el mismo hueco no cambia nada', () => {
    const r = assignKey(DEFAULT_KEY_MAP, 'camera', 0, 'KeyC');
    expect(r).toEqual({ ok: true, map: DEFAULT_KEY_MAP, moved: null });
  });

  it('intercambia entre acciones', () => {
    const r = assignKey(DEFAULT_KEY_MAP, 'camera', 0, 'KeyW');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.map.camera).toEqual(['KeyW', null]);
      expect(r.map.throttle).toEqual(['KeyC', 'ArrowUp']);
      expect(r.moved).toEqual({ action: 'throttle', slot: 0 });
    }
  });

  it('intercambia entre huecos de la misma acción', () => {
    const r = assignKey(DEFAULT_KEY_MAP, 'throttle', 0, 'ArrowUp');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.map.throttle).toEqual(['ArrowUp', 'KeyW']);
  });

  it('rechaza si deja sin tecla a una acción de conducción', () => {
    const solo = clearKey(DEFAULT_KEY_MAP, 'throttle', 1);
    expect(solo.ok).toBe(true);
    if (!solo.ok) return;
    // camera tenía KeyC, que pasa a throttle: es válido.
    expect(assignKey(solo.map, 'camera', 0, 'KeyW').ok).toBe(true);
    // camera no tenía nada en el hueco 1: throttle se quedaría vacía.
    expect(assignKey(solo.map, 'camera', 1, 'KeyW')).toEqual({
      ok: false,
      reason: 'lastKey',
      action: 'throttle',
    });
  });
});

describe('clearKey', () => {
  it('quita una tecla y normaliza', () => {
    const r = clearKey(DEFAULT_KEY_MAP, 'throttle', 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.map.throttle).toEqual(['ArrowUp', null]);
    expect(DEFAULT_KEY_MAP.throttle).toEqual(['KeyW', 'ArrowUp']);
  });

  it('no deja sin teclas a la conducción pero sí a las demás', () => {
    expect(clearKey(DEFAULT_KEY_MAP, 'handbrake', 0).ok).toBe(true);
    const a = clearKey(DEFAULT_KEY_MAP, 'left', 1);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(clearKey(a.map, 'left', 0)).toEqual({ ok: false, reason: 'lastKey', action: 'left' });
    expect(DRIVING_ACTIONS).toContain('left');
  });
});

describe('keyLabel', () => {
  it('nombra letras, dígitos, teclado numérico y especiales', () => {
    expect(keyLabel('KeyA')).toBe('A');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Numpad1')).toBe('Num 1');
    expect(keyLabel('Space')).toBe('Espacio');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('Desconocida')).toBe('Desconocida');
    expect(keyLabel('numpadPrefix')).toBe('numpadPrefix');
    expect(keyLabel('toString')).toBe('toString');
  });
});

describe('keyMapsEqual', () => {
  it('detecta diferencias', () => {
    const r = assignKey(DEFAULT_KEY_MAP, 'camera', 1, 'KeyV');
    expect(r.ok && keyMapsEqual(r.map, DEFAULT_KEY_MAP)).toBe(false);
  });
});

describe('actionKeysLabel', () => {
  it('une las teclas de una acción y pone Esc delante en la pausa', () => {
    expect(actionKeysLabel(DEFAULT_KEY_MAP, 'throttle')).toBe('W / ↑');
    expect(actionKeysLabel(DEFAULT_KEY_MAP, 'mute')).toBe('M');
    expect(actionKeysLabel(DEFAULT_KEY_MAP, 'pause')).toBe('Esc / P');
  });

  it('sin teclas devuelve el texto vacío indicado (la pausa siempre tiene Esc)', () => {
    const result = clearKey(DEFAULT_KEY_MAP, 'mute', 0);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(actionKeysLabel(result.map, 'mute', '—')).toBe('—');
    const noP = clearKey(DEFAULT_KEY_MAP, 'pause', 0);
    if (noP.ok) expect(actionKeysLabel(noP.map, 'pause')).toBe('Esc');
  });
});
