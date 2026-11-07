import { Rng } from '../../core/rng';
import { AUDIO } from '../../data/balance';
import type { EngineVoice } from '../engine';
import { MusicSequencer, type MusicNote } from '../music';
import type { Cue } from '../sfx';

/**
 * Adaptador WebAudio: aplica a nodos de audio los niveles que calcula la lógica pura de src/audio.
 * Es la única parte del audio que usa la API del navegador. Todo el sonido es sintetizado (osciladores y
 * ruido generado con semilla), sin archivos. La mezcla pasa por un compresor y un limitador y el volumen
 * general es moderado. El contexto de audio solo se crea tras una interacción del jugador.
 */

/** Rapidez con la que los parámetros continuos siguen a su objetivo (s, constante de tiempo). */
const SMOOTH = 0.05;
const RIVAL_VOICES = 2;

/** Lo que suena de forma continua en este frame. */
export interface SoundFrame {
  /** Se está conduciendo (si no, los sonidos continuos se apagan). */
  driving: boolean;
  engine: EngineVoice;
  /** Derrape y viento, 0..1. */
  skid: number;
  wind: number;
  /** Motores de los rivales más cercanos (solo valen los `rivalCount` primeros). */
  rivals: readonly { frequency: number; gain: number; pan: number }[];
  rivalCount: number;
}

interface EngineNodes {
  osc: OscillatorNode;
  sub: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode | null;
}

type AudioContextConstructor = new () => AudioContext;

/**
 * Indica si el jugador ya interactuó con la página (clic o tecla que el navegador considera un gesto; Esc no
 * cuenta). Si el navegador no lo informa, se supone que sí.
 */
function userHasInteracted(): boolean {
  const activation = (
    globalThis.navigator as
      (Navigator & { userActivation?: { hasBeenActive: boolean } }) | undefined
  )?.userActivation;
  return activation ? activation.hasBeenActive : true;
}

function audioContextConstructor(): AudioContextConstructor | null {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private engine: EngineNodes | null = null;
  private readonly rivals: EngineNodes[] = [];
  private skidGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private muted = false;
  private paused = true;
  private volume: number = AUDIO.defaultVolume;
  private musicOn = true;
  private sequencer = new MusicSequencer(0x7a2ada);
  private musicStep = 0;
  private musicTime = 0;
  private failed = false;
  /** Variaciones de los golpes (punto de inicio en el ruido). */
  private readonly rng = new Rng(0x60fe);

  /** Crea el contexto de audio. Debe llamarse dentro de un gesto del jugador (clic o tecla). */
  unlock(): void {
    // Sin una interacción real del jugador el navegador no deja sonar (y avisa en la consola): se espera.
    if (!userHasInteracted()) return;
    if (this.ctx || this.failed) {
      this.applyRunState();
      return;
    }
    const Ctor = audioContextConstructor();
    if (!Ctor) {
      this.failed = true;
      return;
    }
    try {
      this.build(new Ctor());
    } catch {
      // Sin audio el juego sigue siendo jugable: todas las señales importantes son también visuales.
      this.failed = true;
      this.ctx = null;
    }
  }

  private build(ctx: AudioContext): void {
    this.ctx = ctx;
    // Cadena final: compresor suave, limitador y volumen general.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    compressor.connect(limiter);
    limiter.connect(this.master);
    this.master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.sfxBus.connect(compressor);
    this.musicBus.connect(compressor);

    // Ruido blanco de 2 s generado con semilla (base del derrape, el viento y los golpes).
    const length = Math.floor(ctx.sampleRate * 2);
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    const rng = new Rng(0xa0d10);
    for (let i = 0; i < length; i++) data[i] = rng.range(-1, 1);

    this.engine = this.createEngine(ctx, false);
    for (let i = 0; i < RIVAL_VOICES; i++) this.rivals.push(this.createEngine(ctx, true));
    this.skidGain = this.createNoiseLoop(ctx, 'bandpass', 1900, 1.4);
    this.windGain = this.createNoiseLoop(ctx, 'lowpass', 650, 0.7);
    this.musicTime = ctx.currentTime + 0.1;
    this.applyRunState();
    this.applyVolume();
  }

  /** Motor: diente de sierra más un subarmónico cuadrado suave, por un paso bajo. */
  private createEngine(ctx: AudioContext, rival: boolean): EngineNodes {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = AUDIO.engineMinHz;
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = AUDIO.engineMinHz / 2;
    const subGain = ctx.createGain();
    // El subarmónico da cuerpo al motor; nunca baja del mínimo de ~78 Hz (ver applyEngine) y se mezcla bajo.
    subGain.gain.value = 0.25;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = AUDIO.engineMinCutoff;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    sub.connect(subGain);
    subGain.connect(filter);
    filter.connect(gain);
    let pan: StereoPannerNode | null = null;
    if (rival && typeof ctx.createStereoPanner === 'function') {
      pan = ctx.createStereoPanner();
      gain.connect(pan);
      pan.connect(this.sfxBus ?? ctx.destination);
    } else {
      gain.connect(this.sfxBus ?? ctx.destination);
    }
    osc.start();
    sub.start();
    return { osc, sub, filter, gain, pan };
  }

  /** Bucle de ruido filtrado con su ganancia (para el derrape y el viento). */
  private createNoiseLoop(
    ctx: AudioContext,
    type: BiquadFilterType,
    frequency: number,
    q: number,
  ): GainNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus ?? ctx.destination);
    source.start();
    return gain;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyRunState();
    this.applyVolume();
  }

  /** Volumen general, 0–100. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
    this.applyVolume();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    const ctx = this.ctx;
    if (ctx && this.musicBus) {
      this.musicBus.gain.setTargetAtTime(on ? AUDIO.musicLevel : 0, ctx.currentTime, 0.3);
    }
  }

  /** Pausa (menús, pestaña oculta): el contexto se suspende y no consume CPU. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.applyRunState();
  }

  private applyRunState(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const run = !this.muted && !this.paused;
    if (run && ctx.state === 'suspended' && userHasInteracted()) {
      ctx.resume().catch(() => undefined);
      this.musicTime = Math.max(this.musicTime, ctx.currentTime + 0.05);
    } else if (!run && ctx.state === 'running') {
      ctx.suspend().catch(() => undefined);
    }
  }

  private applyVolume(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const target = this.muted ? 0 : AUDIO.masterGain * (this.volume / 100);
    this.master.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    this.setMusic(this.musicOn);
  }

  /** Sonidos continuos de este frame. */
  update(frame: SoundFrame): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.engine) return;
    const now = ctx.currentTime;
    const on = frame.driving ? 1 : 0;
    this.applyEngine(
      this.engine,
      frame.engine.frequency,
      frame.engine.cutoff,
      frame.engine.gain * AUDIO.engineLevel * on,
      0,
      now,
    );
    for (let i = 0; i < this.rivals.length; i++) {
      const nodes = this.rivals[i];
      const rival = i < frame.rivalCount ? frame.rivals[i] : undefined;
      if (!nodes) continue;
      if (rival) {
        this.applyEngine(
          nodes,
          rival.frequency,
          AUDIO.engineMaxCutoff * 0.5,
          rival.gain * AUDIO.rivalEngineLevel * on,
          rival.pan,
          now,
        );
      } else {
        nodes.gain.gain.setTargetAtTime(0, now, SMOOTH);
      }
    }
    this.skidGain?.gain.setTargetAtTime(frame.skid * AUDIO.skidLevel * on, now, SMOOTH);
    this.windGain?.gain.setTargetAtTime(frame.wind * AUDIO.windLevel * on, now, 0.2);
    this.scheduleMusic(now);
  }

  private applyEngine(
    nodes: EngineNodes,
    frequency: number,
    cutoff: number,
    gain: number,
    pan: number,
    now: number,
  ): void {
    nodes.osc.frequency.setTargetAtTime(frequency, now, SMOOTH);
    nodes.sub.frequency.setTargetAtTime(Math.max(AUDIO.engineMinHz, frequency / 2), now, SMOOTH);
    nodes.filter.frequency.setTargetAtTime(cutoff, now, SMOOTH);
    nodes.gain.gain.setTargetAtTime(gain, now, SMOOTH);
    nodes.pan?.pan.setTargetAtTime(pan, now, SMOOTH);
  }

  /** Golpe suave: ruido grave filtrado con una caída corta y un "toc" sordo. Nivel 0..1. */
  impact(level: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || !this.noise || level <= 0) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700 + 600 * level;
    const gain = ctx.createGain();
    const peak = AUDIO.impactLevel * level;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.22);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus ?? ctx.destination);
    source.start(now, this.rng.range(0, 1.5), 0.25);
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(80, now + 0.15);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(peak * 0.8, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.0005, now + 0.18);
    thump.connect(thumpGain);
    thumpGain.connect(this.sfxBus ?? ctx.destination);
    thump.start(now);
    thump.stop(now + 0.2);
  }

  /** Pitidos de cuenta atrás, salida, vuelta y llegada (tonos suaves, sin agudos estridentes). */
  cue(cue: Cue): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const notes: readonly (readonly [number, number, number])[] =
      cue === 'tick'
        ? [[620, 0, 0.12]]
        : cue === 'go'
          ? [[930, 0, 0.35]]
          : cue === 'lap'
            ? [
                [700, 0, 0.12],
                [1050, 0.12, 0.18],
              ]
            : [
                [660, 0, 0.14],
                [880, 0.14, 0.14],
                [1100, 0.28, 0.3],
              ];
    for (const [frequency, start, duration] of notes) {
      this.tone('triangle', frequency, now + start, duration, AUDIO.cueLevel, this.sfxBus);
    }
  }

  /** Nota con envolvente de ataque corto y caída suave. */
  private tone(
    type: OscillatorType,
    frequency: number,
    start: number,
    duration: number,
    level: number,
    bus: GainNode | null,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0005, start + duration);
    osc.connect(gain);
    gain.connect(bus ?? ctx.destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  /** Programa las notas de la música que caen en los próximos 0,2 s. */
  private scheduleMusic(now: number): void {
    if (!this.musicOn || !this.musicBus) return;
    const stepSeconds = MusicSequencer.stepSeconds();
    // Tras una pausa larga no se intentan recuperar las notas perdidas.
    if (this.musicTime < now - 0.5) this.musicTime = now + 0.05;
    while (this.musicTime < now + 0.2) {
      const { notes, count } = this.sequencer.notesAt(this.musicStep);
      for (let i = 0; i < count; i++) {
        const note = notes[i];
        if (note) this.playNote(note, this.musicTime, stepSeconds);
      }
      this.musicStep++;
      this.musicTime += stepSeconds;
    }
  }

  private playNote(note: MusicNote, start: number, stepSeconds: number): void {
    const duration = note.steps * stepSeconds;
    const type: OscillatorType =
      note.voice === 'bass' ? 'triangle' : note.voice === 'pad' ? 'sine' : 'triangle';
    const level =
      note.velocity * (note.voice === 'pad' ? 0.35 : note.voice === 'bass' ? 0.8 : 0.45);
    this.tone(type, note.frequency, start, duration, level, this.musicBus);
  }

  /** Nueva secuencia de música (por ejemplo, al empezar otra carrera). */
  reseedMusic(seed: number): void {
    this.sequencer = new MusicSequencer(seed);
    this.musicStep = 0;
  }
}
