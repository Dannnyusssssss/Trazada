import { describe, expect, it } from 'vitest';
import { createEngineVoice, engineVoice, Gearbox } from '../src/audio/engine';
import { MusicSequencer, midiToHz } from '../src/audio/music';
import { CueTracker, impactLevel, rivalMix, windLevel, type Cue } from '../src/audio/sfx';
import { AUDIO, SIM } from '../src/data/balance';
import { createRaceState } from '../src/game/race';

describe('motor', () => {
  it('la caja de cambios sube de marcha al acelerar y baja con histéresis', () => {
    const gearbox = new Gearbox();
    const gears: number[] = [];
    for (let s = 0; s <= 1; s += 0.01) {
      gearbox.update(s);
      gears.push(gearbox.gear);
    }
    expect(gears[0]).toBe(1);
    expect(gears.at(-1)).toBe(AUDIO.gearTops.length);
    // Nunca baja de marcha mientras acelera.
    for (let i = 1; i < gears.length; i++)
      expect(gears[i] ?? 0).toBeGreaterThanOrEqual(gears[i - 1] ?? 0);
    // Justo por debajo del cambio no vuelve a bajar (histéresis).
    const g = new Gearbox();
    g.update(0.21);
    expect(g.gear).toBe(2);
    g.update(0.19);
    expect(g.gear).toBe(2);
    g.update(0.1);
    expect(g.gear).toBe(1);
  });

  it('al subir de marcha bajan las RPM', () => {
    const gearbox = new Gearbox();
    const before = gearbox.update(0.19);
    const after = gearbox.update(0.2);
    expect(gearbox.gear).toBe(2);
    expect(after).toBeLessThan(before);
  });

  it('la frecuencia sigue a las RPM y nunca baja de ~70 Hz', () => {
    const voice = createEngineVoice();
    engineVoice(0, 0, voice);
    expect(voice.frequency).toBeGreaterThanOrEqual(70);
    const idle = voice.frequency;
    const idleCutoff = voice.cutoff;
    engineVoice(1, 1, voice);
    expect(voice.frequency).toBeGreaterThan(idle);
    expect(voice.cutoff).toBeGreaterThan(idleCutoff);
    expect(voice.gain).toBeLessThanOrEqual(1);
    // Con más carga (acelerador) el filtro se abre más a las mismas RPM.
    const light = engineVoice(0.6, 0, createEngineVoice()).cutoff;
    const loaded = engineVoice(0.6, 1, createEngineVoice()).cutoff;
    expect(loaded).toBeGreaterThan(light);
  });
});

describe('efectos de sonido', () => {
  it('el viento crece con la velocidad y queda en 0..1', () => {
    expect(windLevel(0, 48)).toBe(0);
    expect(windLevel(24, 48)).toBeCloseTo(0.25, 9);
    expect(windLevel(100, 48)).toBe(1);
  });

  it('los roces muy suaves no suenan y los golpes fuertes tienen tope', () => {
    expect(impactLevel(0.5)).toBe(0);
    expect(impactLevel(AUDIO.impactMinSpeed + 1)).toBeGreaterThan(0);
    expect(impactLevel(100)).toBe(1);
  });

  it('un rival a la izquierda suena a la izquierda y se apaga a lo lejos', () => {
    const out = { gain: 0, pan: 0 };
    // Rumbo 0: el coche mira a +x y su izquierda es -z.
    rivalMix(0, -10, 0, out);
    expect(out.pan).toBeLessThan(0);
    expect(out.gain).toBeGreaterThan(0);
    rivalMix(0, 10, 0, out);
    expect(out.pan).toBeGreaterThan(0);
    rivalMix(AUDIO.rivalRange + 1, 0, 0, out);
    expect(out.gain).toBe(0);
  });

  it('avisa cada segundo de la cuenta atrás, en la salida, en cada vuelta y en la meta', () => {
    const race = createRaceState(null, 2);
    const tracker = new CueTracker();
    const cues: Cue[] = [];
    const push = (): void => {
      const cue = tracker.update(race);
      if (cue) cues.push(cue);
    };
    while (race.countdownSteps > 0) {
      push();
      race.countdownSteps--;
    }
    race.phase = 'racing';
    push();
    push();
    race.lapsCompleted = 1;
    push();
    race.lapsCompleted = 2;
    race.phase = 'finished';
    push();
    push();
    expect(cues).toEqual(['tick', 'tick', 'tick', 'go', 'lap', 'finish']);
    expect(SIM.hz).toBeGreaterThan(0);
  });
});

describe('música generativa', () => {
  it('es determinista con la misma semilla', () => {
    const collect = (seed: number): number[] => {
      const seq = new MusicSequencer(seed);
      const out: number[] = [];
      for (let i = 0; i < 128; i++) {
        const { notes, count } = seq.notesAt(i);
        for (let k = 0; k < count; k++) out.push(notes[k]?.frequency ?? 0);
      }
      return out;
    };
    expect(collect(7)).toEqual(collect(7));
    expect(collect(7)).not.toEqual(collect(8));
  });

  it('todas las notas suenan en altavoces de portátil (≥ 70 Hz) y en un rango cómodo', () => {
    const seq = new MusicSequencer(3);
    let notes = 0;
    for (let i = 0; i < 512; i++) {
      const result = seq.notesAt(i);
      for (let k = 0; k < result.count; k++) {
        const note = result.notes[k];
        if (!note) continue;
        notes++;
        expect(note.frequency).toBeGreaterThanOrEqual(70);
        expect(note.frequency).toBeLessThan(1200);
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.velocity).toBeLessThanOrEqual(1);
      }
    }
    expect(notes).toBeGreaterThan(100);
    expect(midiToHz(69)).toBeCloseTo(440, 9);
  });
});
