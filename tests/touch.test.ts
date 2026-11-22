import { describe, expect, it } from 'vitest';
import { InputState, createControls } from '../src/core/input';
import type { Action } from '../src/core/input';
import { mergeControls } from '../src/core/gamepad';
import { MAX_TOUCH_POINTERS, TouchState, mirrorLayout } from '../src/core/touch';

const manual = { autoThrottle: false };
const auto = { autoThrottle: true };

describe('TouchState', () => {
  it('combina varios dedos a la vez', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'left');
    t.down(2, 'touch', 'throttle');
    t.down(3, 'touch', 'handbrake');
    const c = t.toControls(createControls(), manual);
    expect(c).toEqual({ throttle: 1, brake: 0, steer: 1, handbrake: true });
  });

  it('soltar un dedo no afecta a los demás', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'right');
    t.down(2, 'touch', 'throttle');
    t.up(1);
    const c = t.toControls(createControls(), manual);
    expect(c.steer).toBe(0);
    expect(c.throttle).toBe(1);
  });

  it('dos dedos en el mismo botón: sigue activo hasta soltar ambos', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'brake');
    t.down(2, 'pen', 'brake');
    t.up(1);
    expect(t.isHeld('brake')).toBe(true);
    t.up(2);
    expect(t.isHeld('brake')).toBe(false);
  });

  it('izquierda y derecha a la vez se anulan', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'left');
    t.down(2, 'touch', 'right');
    expect(t.toControls(createControls(), manual).steer).toBe(0);
  });

  it('cancel y releaseAll sueltan todo', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'left');
    t.down(2, 'touch', 'brake');
    t.cancel(1);
    expect(t.isHeld('left')).toBe(false);
    expect(t.isHeld('brake')).toBe(true);
    t.down(3, 'touch', 'pause');
    t.releaseAll();
    expect(t.activePointers).toBe(0);
    expect(t.isHeld('brake')).toBe(false);
    expect(t.consumeActions([])).toEqual([]);
  });

  it('ignora punteros desconocidos', () => {
    const t = new TouchState();
    t.up(9);
    t.cancel(9);
    t.move(9, 'left');
    expect(t.activePointers).toBe(0);
    expect(t.isHeld('left')).toBe(false);
  });

  it('ignora el ratón y los identificadores inválidos', () => {
    const t = new TouchState();
    t.down(1, 'mouse', 'left');
    t.down(Number.NaN, 'touch', 'left');
    t.down(1.5, 'touch', 'left');
    t.down(Infinity, 'touch', 'left');
    expect(t.activePointers).toBe(0);
    expect(t.isHeld('left')).toBe(false);
  });

  it('respeta el límite de punteros', () => {
    const t = new TouchState();
    for (let i = 0; i < MAX_TOUCH_POINTERS + 5; i++) t.down(i, 'touch', 'throttle');
    expect(t.activePointers).toBe(MAX_TOUCH_POINTERS);
    t.up(MAX_TOUCH_POINTERS + 1);
    expect(t.activePointers).toBe(MAX_TOUCH_POINTERS);
  });

  it('deslizar a otro botón o fuera de todos', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'left');
    t.move(1, 'right');
    expect(t.isHeld('left')).toBe(false);
    expect(t.isHeld('right')).toBe(true);
    t.move(1, null);
    expect(t.isHeld('right')).toBe(false);
    expect(t.activePointers).toBe(1);
    t.up(1);
    expect(t.activePointers).toBe(0);
  });

  it('las acciones de un disparo salen una sola vez por pulsación', () => {
    const t = new TouchState();
    const out: Action[] = [];
    t.down(1, 'touch', 'respawn');
    t.down(2, 'touch', 'pause');
    expect(t.consumeActions(out)).toEqual(['respawn', 'pause']);
    expect(t.consumeActions(out)).toEqual([]);
    t.up(1);
    t.down(1, 'touch', 'respawn');
    expect(t.consumeActions(out)).toEqual(['respawn']);
  });

  it('deslizar sobre un botón de un disparo no lo dispara', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'left');
    t.move(1, 'camera');
    expect(t.consumeActions([])).toEqual([]);
  });

  describe('aceleración automática', () => {
    it('acelera sin tocar nada', () => {
      const c = new TouchState().toControls(createControls(), auto);
      expect(c.throttle).toBe(1);
      expect(c.brake).toBe(0);
    });

    it('con freno pulsado: acelerador 0 y freno 1', () => {
      const t = new TouchState();
      t.down(1, 'touch', 'brake');
      const c = t.toControls(createControls(), auto);
      expect(c.throttle).toBe(0);
      expect(c.brake).toBe(1);
    });

    it('desactivada: no acelera sin pulsar', () => {
      const c = new TouchState().toControls(createControls(), manual);
      expect(c.throttle).toBe(0);
    });
  });
});

describe('mirrorLayout', () => {
  it('diestro: dirección a la izquierda, pedales a la derecha', () => {
    expect(mirrorLayout(false)).toEqual({ steer: 'start', pedals: 'end' });
  });

  it('zurdo: espejo', () => {
    expect(mirrorLayout(true)).toEqual({ steer: 'end', pedals: 'start' });
  });

  it('el espejo no invierte el giro', () => {
    const t = new TouchState();
    t.down(1, 'touch', 'left');
    expect(t.toControls(createControls(), manual).steer).toBe(1);
  });
});

describe('combinación con el teclado', () => {
  it('mergeControls une teclado y táctil', () => {
    const keys = new InputState();
    keys.keyDown('KeyD', false);
    const kc = keys.toControls(createControls());

    const t = new TouchState();
    t.down(1, 'touch', 'throttle');
    t.down(2, 'touch', 'handbrake');
    const tc = t.toControls(createControls(), manual);

    const out = mergeControls(kc, tc, createControls());
    expect(out).toEqual({ throttle: 1, brake: 0, steer: -1, handbrake: true });
  });
});
