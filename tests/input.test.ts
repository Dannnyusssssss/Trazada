import { describe, expect, it } from 'vitest';
import {
  InputState,
  actionForCode,
  createControls,
  shouldPreventDefault,
  smoothSteer,
} from '../src/core/input';
import { assignKey, DEFAULT_KEY_MAP, type KeyMap } from '../src/core/bindings';

describe('mapeo de teclas', () => {
  it('cubre todos los controles del juego', () => {
    expect(actionForCode('KeyW')).toBe('throttle');
    expect(actionForCode('ArrowUp')).toBe('throttle');
    expect(actionForCode('KeyS')).toBe('brake');
    expect(actionForCode('ArrowDown')).toBe('brake');
    expect(actionForCode('KeyA')).toBe('left');
    expect(actionForCode('ArrowLeft')).toBe('left');
    expect(actionForCode('KeyD')).toBe('right');
    expect(actionForCode('ArrowRight')).toBe('right');
    expect(actionForCode('Space')).toBe('handbrake');
    expect(actionForCode('KeyR')).toBe('respawn');
    expect(actionForCode('KeyC')).toBe('camera');
    expect(actionForCode('Escape')).toBe('pause');
    expect(actionForCode('KeyP')).toBe('pause');
    expect(actionForCode('KeyM')).toBe('mute');
  });

  it('no usa Ctrl ni teclas ajenas', () => {
    expect(actionForCode('ControlLeft')).toBeNull();
    expect(actionForCode('ControlRight')).toBeNull();
    expect(actionForCode('Tab')).toBeNull();
    expect(actionForCode('toString')).toBeNull();
  });

  it('solo bloquea flechas y espacio', () => {
    expect(shouldPreventDefault('ArrowUp')).toBe(true);
    expect(shouldPreventDefault('Space')).toBe(true);
    expect(shouldPreventDefault('Tab')).toBe(false);
    expect(shouldPreventDefault('Escape')).toBe(false);
    expect(shouldPreventDefault('KeyW')).toBe(false);
  });
});

describe('InputState', () => {
  it('traduce teclas mantenidas a controles', () => {
    const input = new InputState();
    const c = createControls();
    input.keyDown('KeyW', false);
    input.keyDown('KeyA', false);
    input.keyDown('Space', false);
    input.toControls(c);
    expect(c).toEqual({ throttle: 1, brake: 0, steer: 1, handbrake: true });
    input.keyDown('KeyD', false);
    input.toControls(c);
    expect(c.steer).toBe(0);
  });

  it('la acción sigue activa mientras quede una tecla pulsada', () => {
    const input = new InputState();
    input.keyDown('KeyW', false);
    input.keyDown('ArrowUp', false);
    input.keyUp('KeyW');
    expect(input.isHeld('throttle')).toBe(true);
    input.keyUp('ArrowUp');
    expect(input.isHeld('throttle')).toBe(false);
  });

  it('las acciones de un disparo se consumen una vez y no se repiten con la autorrepetición', () => {
    const input = new InputState();
    input.keyDown('KeyR', false);
    input.keyDown('KeyR', true);
    expect(input.consume('respawn')).toBe(true);
    expect(input.consume('respawn')).toBe(false);
  });

  it('clear suelta todo', () => {
    const input = new InputState();
    input.keyDown('KeyW', false);
    input.clear();
    expect(input.isHeld('throttle')).toBe(false);
    expect(input.consume('throttle')).toBe(false);
  });
});

describe('InputState con teclas personalizadas', () => {
  function customMap(): KeyMap {
    const r = assignKey(DEFAULT_KEY_MAP, 'camera', 0, 'KeyV');
    if (!r.ok) throw new Error('mapa de prueba inválido');
    return r.map;
  }

  it('la tecla vieja deja de funcionar y la nueva funciona', () => {
    const input = new InputState();
    input.setKeyMap(customMap());
    expect(input.keyDown('KeyC', false)).toBeNull();
    expect(input.keyDown('KeyV', false)).toBe('camera');
    expect(input.consume('camera')).toBe(true);
  });

  it('Escape sigue pausando aunque el mapa no lo tenga', () => {
    const input = new InputState();
    input.setKeyMap(customMap());
    expect(input.keyDown('Escape', false)).toBe('pause');
    expect(input.keyUp('Escape')).toBe('pause');
    expect(input.actionFor('KeyP')).toBe('pause');
  });

  it('cambiar el mapa suelta las teclas pulsadas', () => {
    const input = new InputState();
    input.keyDown('KeyW', false);
    input.setKeyMap(customMap());
    expect(input.isHeld('throttle')).toBe(false);
  });
});

describe('smoothSteer', () => {
  it('direct devuelve el objetivo', () => {
    expect(smoothSteer(0, 1, 'direct', 0.016)).toBe(1);
    expect(smoothSteer(0.5, -1, 'direct', 0)).toBe(-1);
  });

  it('converge sin pasarse', () => {
    let v = 0;
    for (let i = 0; i < 200; i++) {
      v = smoothSteer(v, 1, 'smooth', 1 / 60);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(v).toBe(1);
    expect(smoothSteer(0, 1, 'normal', 1 / 60)).toBeCloseTo(0.15, 9);
    expect(smoothSteer(0.95, 1, 'normal', 1)).toBe(1);
  });

  it('vuelve al centro e invierte más rápido que al girar', () => {
    const out = smoothSteer(1, 0, 'normal', 0.01);
    const inn = smoothSteer(0, 1, 'normal', 0.01);
    expect(1 - out).toBeCloseTo(2 * inn, 9);
    expect(smoothSteer(0.5, -1, 'normal', 0.01)).toBeCloseTo(0.5 - 0.18, 9);
  });

  it('ignora un dt inválido', () => {
    for (const dt of [0, -1, NaN, Infinity]) expect(smoothSteer(0.3, 1, 'smooth', dt)).toBe(0.3);
    expect(smoothSteer(5, 1, 'smooth', NaN)).toBe(1);
  });
});
