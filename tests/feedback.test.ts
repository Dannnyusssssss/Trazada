import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { EFFECTS } from '../src/data/balance';
import { createCarState } from '../src/game/car';
import { BrakeLight, RateLimiter, skidIntensity } from '../src/game/feedback';
import { CameraEffects } from '../src/render/camera';

describe('derrape', () => {
  it('crece con el deslizamiento lateral y no hay derrape en el césped', () => {
    const car = createCarState();
    const controls = createControls();
    car.lateralSpeed = 1;
    expect(skidIntensity(car, controls)).toBe(0);
    car.lateralSpeed = -EFFECTS.skidFullSlip;
    expect(skidIntensity(car, controls)).toBe(1);
    car.lateralSpeed = (EFFECTS.skidMinSlip + EFFECTS.skidFullSlip) / 2;
    expect(skidIntensity(car, controls)).toBeCloseTo(0.5, 9);
    car.surface = 'grass';
    expect(skidIntensity(car, controls)).toBe(0);
  });

  it('el freno de mano a velocidad cuenta como derrape', () => {
    const car = createCarState();
    const controls = createControls();
    controls.handbrake = true;
    car.forwardSpeed = EFFECTS.handbrakeSkidSpeed + 2;
    expect(skidIntensity(car, controls)).toBeGreaterThan(0);
  });
});

/** Cuenta los encendidos (subidas por encima de la mitad del brillo) en una serie de brillos. */
function countFlashes(levels: readonly number[]): number {
  let flashes = 0;
  let on = false;
  for (const level of levels) {
    if (!on && level > 0.5) {
      flashes++;
      on = true;
    } else if (on && level < 0.5) {
      on = false;
    }
  }
  return flashes;
}

describe('luces de freno (fotosensibilidad)', () => {
  it('aunque se pulse el freno muy rápido, no destellan más de 3 veces por segundo', () => {
    const light = new BrakeLight();
    const dt = 1 / 60;
    const levels: number[] = [];
    // Freno pulsado y soltado cada frame alterno durante 5 segundos (el peor caso posible).
    for (let i = 0; i < 300; i++) levels.push(light.update(i % 2 === 0, dt));
    expect(countFlashes(levels) / 5).toBeLessThanOrEqual(3);
    // Pulsaciones de 0,1 s cada 0,2 s.
    const light2 = new BrakeLight();
    const levels2: number[] = [];
    for (let i = 0; i < 300; i++) levels2.push(light2.update(i % 12 < 6, dt));
    expect(countFlashes(levels2) / 5).toBeLessThanOrEqual(3);
  });

  it('se enciende al frenar y se apaga con un fundido al soltar', () => {
    const light = new BrakeLight();
    const dt = 1 / 60;
    for (let i = 0; i < 30; i++) light.update(true, dt);
    expect(light.level).toBe(1);
    for (let i = 0; i < 60; i++) light.update(false, dt);
    expect(light.level).toBe(0);
  });
});

describe('tope de ráfagas', () => {
  it('permite un efecto cada intervalo como mucho', () => {
    const limiter = new RateLimiter(EFFECTS.sparkInterval);
    const dt = 1 / 60;
    let fired = 0;
    for (let i = 0; i < 600; i++) {
      limiter.update(dt);
      if (limiter.tryFire()) fired++;
    }
    // 10 s con un intento por frame: como mucho 1 / intervalo por segundo (≤ 3 por segundo).
    expect(fired).toBeLessThanOrEqual(Math.ceil(10 / EFFECTS.sparkInterval) + 1);
    expect(1 / EFFECTS.sparkInterval).toBeLessThanOrEqual(3);
  });
});

describe('efectos de cámara', () => {
  it('con «Reducir movimiento» no hay sacudida ni cambio de campo de visión', () => {
    const effects = new CameraEffects();
    effects.hit(20);
    for (let i = 0; i < 120; i++) effects.update(1, 1 / 60, true);
    expect(effects.fovOffset).toBe(0);
    expect(effects.shake.length()).toBe(0);
  });

  it('sin la opción, el campo de visión crece suave con la velocidad y la sacudida es leve', () => {
    const effects = new CameraEffects();
    for (let i = 0; i < 600; i++) effects.update(1, 1 / 60, false);
    expect(effects.fovOffset).toBeGreaterThan(0);
    expect(effects.fovOffset).toBeLessThanOrEqual(EFFECTS.fovBoost);
    expect(effects.shake.length()).toBeLessThan(0.1);
    // Parado no hay aumento de campo de visión.
    const still = new CameraEffects();
    for (let i = 0; i < 600; i++) still.update(0.2, 1 / 60, false);
    expect(still.fovOffset).toBeCloseTo(0, 6);
  });
});
