import { describe, expect, it } from 'vitest';
import type { GamepadSnapshot } from '../src/core/gamepad';
import { MenuPad, type MenuCommand } from '../src/core/menu-nav';

function snap(
  axes: Record<number, number> = {},
  buttons: Record<number, number> = {},
): GamepadSnapshot {
  const a = new Array<number>(4).fill(0);
  const b = new Array<number>(17).fill(0);
  for (const [i, v] of Object.entries(axes)) a[Number(i)] = v;
  for (const [i, v] of Object.entries(buttons)) b[Number(i)] = v;
  return { axes: a, buttons: b };
}

const IDLE = snap();

function prime(pad: MenuPad, out: MenuCommand[]): void {
  pad.update(IDLE, 0, out);
}

describe('navegación de menús con el mando', () => {
  it('dispara por flanco y solo una vez al mantener', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    prime(pad, out);
    expect(pad.update(snap({}, { 0: 1, 1: 1, 4: 1, 5: 1 }), 0.016, out)).toEqual([
      'accept',
      'back',
      'tabPrev',
      'tabNext',
    ]);
    expect(pad.update(snap({}, { 0: 1 }), 0.5, out)).toEqual([]);
    expect(pad.update(snap({}, { 0: 1 }), 5, out)).toEqual([]);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(snap({}, { 0: 1 }), 0.016, out)).toEqual(['accept']);
  });

  it('la cruceta mapea a las cuatro direcciones', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    prime(pad, out);
    expect(pad.update(snap({}, { 12: 1 }), 0.016, out)).toEqual(['up']);
    expect(pad.update(snap({}, { 13: 1 }), 0.016, out)).toEqual(['down']);
    expect(pad.update(snap({}, { 14: 1 }), 0.016, out)).toEqual(['left']);
    expect(pad.update(snap({}, { 15: 1 }), 0.016, out)).toEqual(['right']);
  });

  it('repite las direcciones: 0.4 s la primera y luego cada 0.12 s', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    prime(pad, out);
    const held = snap({}, { 13: 1 });
    expect(pad.update(held, 0.016, out)).toEqual(['down']);
    expect(pad.update(held, 0.3, out)).toEqual([]);
    expect(pad.update(held, 0.09, out)).toEqual([]);
    expect(pad.update(held, 0.02, out)).toEqual(['down']); // 0.41 s
    expect(pad.update(held, 0.1, out)).toEqual([]);
    expect(pad.update(held, 0.03, out)).toEqual(['down']); // 0.13 s después
    expect(pad.update(held, 0.12, out)).toEqual(['down']);
  });

  it('soltar reinicia la repetición', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    prime(pad, out);
    const held = snap({}, { 13: 1 });
    pad.update(held, 0.016, out);
    pad.update(held, 0.39, out);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(held, 0.016, out)).toEqual(['down']);
    expect(pad.update(held, 0.39, out)).toEqual([]);
  });

  it('el stick usa umbral 0.5 y el eje Y negativo es arriba', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    prime(pad, out);
    expect(pad.update(snap({ 0: 0.4 }), 0.016, out)).toEqual([]);
    expect(pad.update(snap({ 0: 0.8 }), 0.016, out)).toEqual(['right']);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(snap({ 0: -0.8 }), 0.016, out)).toEqual(['left']);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(snap({ 1: -0.9 }), 0.016, out)).toEqual(['up']);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(snap({ 1: 0.9 }), 0.016, out)).toEqual(['down']);
  });

  it('en diagonal solo cuenta el eje de mayor magnitud', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    prime(pad, out);
    expect(pad.update(snap({ 0: 0.7, 1: 0.9 }), 0.016, out)).toEqual(['down']);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(snap({ 0: -0.95, 1: -0.6 }), 0.016, out)).toEqual(['left']);
  });

  it('la primera lectura y clear() no disparan con botones ya pulsados', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = [];
    const held = snap({}, { 0: 1, 13: 1 });
    expect(pad.update(held, 0.016, out)).toEqual([]);
    expect(pad.update(held, 0.1, out)).toEqual([]);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(held, 0.016, out)).toEqual(['down', 'accept']);
    pad.clear();
    expect(pad.update(held, 0.016, out)).toEqual([]);
    expect(pad.update(held, 0.016, out)).toEqual([]);
    pad.update(IDLE, 0.016, out);
    expect(pad.update(held, 0.016, out)).toEqual(['down', 'accept']);
  });

  it('vacía out y tolera arrays vacíos, dt no válido y valores no finitos', () => {
    const pad = new MenuPad();
    const out: MenuCommand[] = ['up'];
    expect(pad.update({ axes: [], buttons: [] }, 0.016, out)).toEqual([]);
    expect(pad.update({ axes: [], buttons: [] }, Number.NaN, out)).toEqual([]);
    expect(pad.update({ axes: [Number.NaN, Infinity], buttons: [Number.NaN] }, -1, out)).toEqual(
      [],
    );
    const held = snap({}, { 12: 1 });
    expect(pad.update(held, Number.NaN, out)).toEqual(['up']);
    expect(pad.update(held, -5, out)).toEqual([]);
    expect(pad.update(held, Infinity, out)).toEqual([]);
  });
});
