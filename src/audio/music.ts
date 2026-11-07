import { Rng } from '../core/rng';
import { AUDIO } from '../data/balance';

/**
 * Música generativa original como lógica pura: con una semilla produce una secuencia de notas por
 * semicorcheas (bajo, acorde de fondo y una melodía sencilla sobre una escala pentatónica).
 * El adaptador WebAudio solo toca las notas que devuelve. Las notas graves no bajan de ~70 Hz.
 */

export type Voice = 'bass' | 'pad' | 'lead';

export interface MusicNote {
  voice: Voice;
  frequency: number;
  /** Duración en semicorcheas. */
  steps: number;
  /** Intensidad relativa, 0..1. */
  velocity: number;
}

/** Frecuencia (Hz) de una nota MIDI. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Acordes de la progresión: nota fundamental (MIDI) y si es menor. */
const CHORDS: readonly (readonly [number, boolean])[] = [
  [45, true], // La menor
  [41, false], // Fa mayor
  [48, false], // Do mayor
  [43, false], // Sol mayor
  [50, true], // Re menor
  [40, true], // Mi menor
];

/** Escala pentatónica menor de La, en la octava de la melodía. */
const LEAD_SCALE: readonly number[] = [69, 72, 74, 76, 79, 81, 84];

const STEPS_PER_BAR = 16;

export class MusicSequencer {
  private readonly rng: Rng;
  /** Progresión de 4 compases elegida con la semilla. */
  readonly progression: number[] = [];
  private readonly out: MusicNote[] = [];
  private leadIndex = 3;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    for (let i = 0; i < 4; i++) this.progression.push(this.rng.int(0, CHORDS.length - 1));
    // Empieza en la tónica para que suene resuelto.
    this.progression[0] = 0;
    // Reserva las notas que puede devolver un paso (bajo, tres del acorde y la melodía).
    for (let i = 0; i < 5; i++)
      this.out.push({ voice: 'bass', frequency: 0, steps: 0, velocity: 0 });
  }

  /** Duración de una semicorchea (s). */
  static stepSeconds(): number {
    return 60 / AUDIO.musicBpm / 4;
  }

  /**
   * Notas que empiezan en el paso `index` (semicorcheas desde el principio). Devuelve un arreglo reutilizado
   * y el número de notas válidas.
   */
  notesAt(index: number): { notes: readonly MusicNote[]; count: number } {
    const bar = Math.floor(index / STEPS_PER_BAR);
    const step = index % STEPS_PER_BAR;
    const chord = CHORDS[this.progression[bar % this.progression.length] ?? 0] ?? CHORDS[0];
    const [root, minor] = chord ?? [45, true];
    let count = 0;
    const push = (voice: Voice, midi: number, steps: number, velocity: number): void => {
      const note = this.out[count];
      if (!note) return;
      note.voice = voice;
      note.frequency = midiToHz(midi);
      note.steps = steps;
      note.velocity = velocity;
      count++;
    };
    // Bajo en cada tiempo, con la quinta en el tercero.
    if (step % 4 === 0) push('bass', step === 8 ? root + 7 : root, 3, step === 0 ? 1 : 0.75);
    // Acorde de fondo al principio de cada compás.
    if (step === 0) {
      const third = minor ? 3 : 4;
      push('pad', root + 12, STEPS_PER_BAR, 0.6);
      push('pad', root + 12 + third, STEPS_PER_BAR, 0.5);
      push('pad', root + 19, STEPS_PER_BAR, 0.5);
    }
    // Melodía: a veces, en corcheas, moviéndose por pasos cortos sobre la escala.
    if (step % 2 === 0 && this.rng.next() < AUDIO.musicLeadDensity) {
      this.leadIndex = Math.max(
        0,
        Math.min(LEAD_SCALE.length - 1, this.leadIndex + this.rng.int(-2, 2)),
      );
      push('lead', LEAD_SCALE[this.leadIndex] ?? 69, 2, 0.5 + 0.3 * this.rng.next());
    }
    return { notes: this.out, count };
  }
}
