import { describe, expect, it } from 'vitest';
import {
  PAD,
  PAD_DEADZONE,
  PadButtons,
  applyDeadzone,
  mergeControls,
  padToControls,
  padTuningFromPercent,
  type GamepadSnapshot,
} from '../src/core/gamepad';
import { createControls, type Action } from '../src/core/input';

function snapshot(
  axes: Record<number, number> = {},
  buttons: Record<number, number> = {},
): GamepadSnapshot {
  const a = new Array<number>(4).fill(0);
  const b = new Array<number>(17).fill(0);
  for (const [i, v] of Object.entries(axes)) a[Number(i)] = v;
  for (const [i, v] of Object.entries(buttons)) b[Number(i)] = v;
  return { axes: a, buttons: b };
}

describe('zona muerta', () => {
  it('ignora valores pequeños y reescala el resto sin salto', () => {
    expect(applyDeadzone(0.1, PAD_DEADZONE)).toBe(0);
    expect(applyDeadzone(-PAD_DEADZONE, PAD_DEADZONE)).toBe(0);
    expect(applyDeadzone(1, PAD_DEADZONE)).toBeCloseTo(1, 9);
    expect(applyDeadzone(-1, PAD_DEADZONE)).toBeCloseTo(-1, 9);
    expect(applyDeadzone(PAD_DEADZONE + 0.01, PAD_DEADZONE)).toBeLessThan(0.02);
  });

  it('valores no válidos o fuera de rango no rompen nada', () => {
    expect(applyDeadzone(Number.NaN, PAD_DEADZONE)).toBe(0);
    expect(applyDeadzone(3, PAD_DEADZONE)).toBe(1);
  });
});

describe('mapeo del mando', () => {
  it('gatillos aceleran y frenan; el stick a la izquierda gira a la izquierda', () => {
    const controls = padToControls(
      snapshot({ [PAD.steerAxis]: -1 }, { [PAD.throttle]: 1, [PAD.brake]: 0.5 }),
      createControls(),
    );
    expect(controls.throttle).toBeCloseTo(1, 9);
    expect(controls.brake).toBeGreaterThan(0.4);
    expect(controls.steer).toBeCloseTo(1, 9);
    expect(controls.handbrake).toBe(false);
  });

  it('A es el freno de mano y la cruceta gira de forma digital', () => {
    const controls = padToControls(
      snapshot({}, { [PAD.handbrake]: 1, [PAD.dpadRight]: 1 }),
      createControls(),
    );
    expect(controls.handbrake).toBe(true);
    expect(controls.steer).toBe(-1);
  });

  it('un mando en reposo no mueve el coche', () => {
    const controls = padToControls(snapshot({ [PAD.steerAxis]: 0.08 }), createControls());
    expect(controls).toEqual({ throttle: 0, brake: 0, steer: 0, handbrake: false });
  });

  it('se combina con el teclado tomando lo mayor', () => {
    const keyboard = createControls();
    keyboard.throttle = 1;
    keyboard.steer = 0.2;
    const pad = createControls();
    pad.brake = 0.7;
    pad.steer = -0.6;
    pad.handbrake = true;
    const out = mergeControls(keyboard, pad, createControls());
    expect(out).toEqual({ throttle: 1, brake: 0.7, steer: -0.6, handbrake: true });
  });
});

describe('botones de un solo disparo', () => {
  it('se detectan por flanco: mantener pulsado no repite', () => {
    const buttons = new PadButtons();
    const out: Action[] = [];
    expect(buttons.update(snapshot({}, { [PAD.pause]: 1 }), out)).toEqual(['pause']);
    expect(buttons.update(snapshot({}, { [PAD.pause]: 1 }), out)).toEqual([]);
    expect(buttons.update(snapshot(), out)).toEqual([]);
    expect(buttons.update(snapshot({}, { [PAD.pause]: 1, [PAD.respawn]: 1 }), out)).toEqual([
      'respawn',
      'pause',
    ]);
  });

  it('clear olvida lo que estaba pulsado', () => {
    const buttons = new PadButtons();
    const out: Action[] = [];
    buttons.update(snapshot({}, { [PAD.camera]: 1 }), out);
    buttons.clear();
    expect(buttons.update(snapshot({}, { [PAD.camera]: 1 }), out)).toEqual(['camera']);
  });
});

describe('padToControls con ajustes', () => {
  it('sin ajustes equivale al comportamiento por defecto', () => {
    for (const v of [-1, -0.6, -0.2, 0, 0.1, 0.4, 1]) {
      const a = padToControls(snapshot({ [PAD.steerAxis]: v }), createControls());
      const b = padToControls(snapshot({ [PAD.steerAxis]: v }), createControls(), {
        deadzone: PAD_DEADZONE,
        sensitivity: 1,
      });
      expect(b.steer).toBeCloseTo(a.steer, 12);
    }
  });

  it('una zona muerta mayor ignora más recorrido', () => {
    const pad = snapshot({ [PAD.steerAxis]: 0.2 });
    expect(padToControls(pad, createControls()).steer).not.toBe(0);
    expect(padToControls(pad, createControls(), padTuningFromPercent(30, 100)).steer).toBe(0);
  });

  it('la sensibilidad cambia la curva sin tocar los extremos', () => {
    const half = snapshot({ [PAD.steerAxis]: -0.575 });
    const lin = padToControls(half, createControls()).steer;
    const high = padToControls(half, createControls(), padTuningFromPercent(15, 150)).steer;
    const low = padToControls(half, createControls(), padTuningFromPercent(15, 50)).steer;
    expect(high).toBeGreaterThan(lin);
    expect(low).toBeLessThan(lin);
    const full = snapshot({ [PAD.steerAxis]: -1 });
    expect(padToControls(full, createControls(), padTuningFromPercent(15, 50)).steer).toBeCloseTo(
      1,
      9,
    );
  });

  it('recorta los valores fuera de rango y la cruceta sigue dando uno', () => {
    const pad = snapshot({ [PAD.steerAxis]: 0.2 });
    expect(padToControls(pad, createControls(), padTuningFromPercent(90, 100)).steer).toBe(0);
    const half = snapshot({ [PAD.steerAxis]: 0.5 });
    const a = padToControls(half, createControls(), { deadzone: 0, sensitivity: 100 });
    const b = padToControls(half, createControls(), { deadzone: 0.05, sensitivity: 1.5 });
    expect(a.steer).toBeCloseTo(b.steer, 12);
    const dpad = snapshot({}, { [PAD.dpadLeft]: 1 });
    expect(padToControls(dpad, createControls(), padTuningFromPercent(30, 50)).steer).toBe(1);
  });
});
