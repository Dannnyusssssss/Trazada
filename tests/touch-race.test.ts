import { describe, expect, it } from 'vitest';
import { createControls } from '../src/core/input';
import { TouchState, type TouchButton } from '../src/core/touch';
import { RACE, SIM } from '../src/data/balance';
import { GORRION } from '../src/data/cars';
import { TRACKS } from '../src/data/tracks';
import { Track } from '../src/game/track';
import { World, type GameMode } from '../src/game/world';
import { autopilot } from './helpers/autopilot';

/**
 * Conducción solo con la pantalla táctil: el piloto automático decide, pero sus órdenes se traducen a
 * dedos sobre los botones (◀ ▶ y ▼, todo o nada) y la aceleración automática pone el acelerador. Así se
 * comprueba que con los controles táctiles digitales se puede terminar una sesión completa.
 */
function driveByTouch(mode: GameMode, trackIndex: number): World {
  const def = TRACKS[trackIndex];
  if (!def) throw new Error('circuito');
  const world = new World(new Track(def), GORRION, null, { mode, difficulty: 'easy', seed: 3 });
  const touch = new TouchState();
  const wish = createControls();
  const controls = createControls();
  const fingers = new Map<TouchButton, number>([
    ['left', 1],
    ['right', 2],
    ['brake', 3],
  ]);
  const hold = (button: TouchButton, down: boolean): void => {
    const id = fingers.get(button) ?? 0;
    if (down && !touch.isHeld(button)) touch.down(id, 'touch', button);
    if (!down && touch.isHeld(button)) touch.up(id);
  };
  const player = world.racers[0];
  if (!player) throw new Error('jugador');
  let steps = 0;
  while (steps < SIM.hz * 420 && player.race.phase !== 'finished') {
    autopilot(world, wish, 9);
    hold('left', wish.steer > 0.2);
    hold('right', wish.steer < -0.2);
    hold('brake', wish.brake > 0.3);
    touch.toControls(controls, { autoThrottle: true });
    world.step({ controls, respawn: false });
    steps++;
  }
  return world;
}

describe('conducción solo con toques', () => {
  for (let i = 0; i < TRACKS.length; i++) {
    it(`contrarreloj completa en ${TRACKS[i]?.name ?? i}`, () => {
      const player = driveByTouch('timeTrial', i).racers[0];
      expect(player?.race.phase).toBe('finished');
      expect(player?.race.lapsCompleted).toBe(RACE.timeTrialLaps);
    });
  }

  it('carrera completa contra los rivales en el primer circuito', () => {
    const player = driveByTouch('race', 0).racers[0];
    expect(player?.race.phase).toBe('finished');
    expect(player?.race.lapsCompleted).toBe(RACE.raceLaps);
  });
});
