import { createEngineVoice, engineVoice, Gearbox } from '../audio/engine';
import { CueTracker, impactLevel, rivalMix, windLevel } from '../audio/sfx';
import type { SoundEngine, SoundFrame } from '../audio/web/sound-engine';
import { AUDIO } from '../data/balance';
import { RateLimiter, skidIntensity } from '../game/feedback';
import type { Racer } from '../game/racer';
import type { World } from '../game/world';

/**
 * Sonido de la carrera: prepara en cada frame la mezcla del motor del jugador, el derrape, el viento, los dos
 * rivales más cercanos, los golpes y los avisos, y se la pasa al motor de sonido. Reutiliza siempre los mismos
 * objetos de mezcla.
 */
export class RaceAudio {
  private readonly cues = new CueTracker();
  private readonly impactLimiter = new RateLimiter(AUDIO.impactInterval);
  private readonly engineVoice = createEngineVoice();
  private readonly rivalVoices = [createEngineVoice(), createEngineVoice()];
  private readonly rivalMixes = [
    { frequency: 0, gain: 0, pan: 0 },
    { frequency: 0, gain: 0, pan: 0 },
  ];
  private readonly mixTmp = { gain: 0, pan: 0 };
  private readonly soundFrame: SoundFrame = {
    driving: false,
    engine: this.engineVoice,
    skid: 0,
    wind: 0,
    rivals: this.rivalMixes,
    rivalCount: 0,
  };
  /** Caja de cambios simulada de cada coche (en el orden de `world.racers`). */
  private gearboxes: Gearbox[] = [];

  constructor(private readonly sound: SoundEngine) {}

  /** Prepara el estado por coche de un mundo nuevo. */
  resetRacers(world: World): void {
    this.gearboxes = world.racers.map(() => new Gearbox());
  }

  /** Reinicia los avisos y las cajas de cambios al empezar una sesión. */
  resetRace(): void {
    this.cues.reset();
    for (const gearbox of this.gearboxes) gearbox.reset();
  }

  /**
   * Sonido de este frame: motor, derrape, viento, rivales cercanos, golpes y avisos. `results` indica que
   * está abierta la pantalla de resultados; `playerImpact`, el golpe del jugador en los pasos del frame.
   */
  update(world: World, dt: number, playing: boolean, results: boolean, playerImpact: number): void {
    const player = world.player;
    const car = player.car;
    const frame = this.soundFrame;
    frame.driving = playing;
    const rpm = this.gearboxes[0]?.update(Math.abs(car.forwardSpeed) / player.params.maxSpeed) ?? 0;
    engineVoice(rpm, player.controls.throttle, this.engineVoice);
    frame.skid = playing ? skidIntensity(car, player.controls) : 0;
    frame.wind = windLevel(car.forwardSpeed, player.params.maxSpeed);

    // Los dos rivales más cercanos, con su motor atenuado por la distancia y su panorámica.
    let first: Racer | null = null;
    let second: Racer | null = null;
    let d1 = Infinity;
    let d2 = Infinity;
    for (let i = 1; i < world.racers.length; i++) {
      const r = world.racers[i];
      if (!r) continue;
      const d = Math.hypot(r.car.x - car.x, r.car.z - car.z);
      if (d < d1) {
        second = first;
        d2 = d1;
        first = r;
        d1 = d;
      } else if (d < d2) {
        second = r;
        d2 = d;
      }
    }
    frame.rivalCount = 0;
    if (first) this.mixRival(first, car.x, car.z, car.heading);
    if (second) this.mixRival(second, car.x, car.z, car.heading);
    this.sound.update(frame);

    // Los avisos se revisan también en los resultados: la llegada se detecta en el frame en que se abren.
    if (playing || results) {
      const cue = this.cues.update(player.race);
      if (cue) this.sound.cue(cue);
    }
    if (playing) {
      this.impactLimiter.update(dt);
      const level = impactLevel(playerImpact);
      if (level > 0 && this.impactLimiter.tryFire()) this.sound.impact(level);
    }
  }

  /** Añade el motor de un rival a la mezcla de este frame. */
  private mixRival(r: Racer, x: number, z: number, heading: number): void {
    const frame = this.soundFrame;
    const voice = this.rivalVoices[frame.rivalCount];
    const mix = this.rivalMixes[frame.rivalCount];
    const gearbox = this.gearboxes[r.index];
    if (!voice || !mix || !gearbox) return;
    const rpm = gearbox.update(Math.abs(r.car.forwardSpeed) / r.params.maxSpeed);
    engineVoice(rpm, r.controls.throttle, voice);
    rivalMix(r.car.x - x, r.car.z - z, heading, this.mixTmp);
    mix.frequency = voice.frequency;
    mix.gain = this.mixTmp.gain * voice.gain;
    mix.pan = this.mixTmp.pan;
    frame.rivalCount++;
  }
}
