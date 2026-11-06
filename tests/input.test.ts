import { describe, expect, it } from 'vitest';
import { InputState, actionForCode, createControls, shouldPreventDefault } from '../src/core/input';

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
