import { describe, expect, it } from 'vitest';
import { FrameStats, type FrameStatsSnapshot } from '../src/core/frame-stats';

const out = (): FrameStatsSnapshot => ({ fps: -1, meanMs: -1, p95Ms: -1 });

describe('FrameStats', () => {
  it('vacío devuelve ceros', () => {
    const s = new FrameStats().sample(out());
    expect(s).toEqual({ fps: 0, meanMs: 0, p95Ms: 0 });
  });

  it('calcula media y p95 con valores conocidos', () => {
    const stats = new FrameStats();
    for (let i = 1; i <= 100; i++) stats.push(i / 1000);
    const s = stats.sample(out());
    expect(s.meanMs).toBeCloseTo(50.5, 3);
    expect(s.p95Ms).toBeCloseTo(96, 3);
  });

  it('el historial circular descarta los frames antiguos', () => {
    const stats = new FrameStats(4);
    for (let i = 0; i < 4; i++) stats.push(1);
    for (let i = 0; i < 4; i++) stats.push(0.01);
    const s = stats.sample(out());
    expect(s.meanMs).toBeCloseTo(10, 4);
    expect(s.p95Ms).toBeCloseTo(10, 4);
  });

  it('FPS = frames entre tiempo de la ventana y se reinicia al muestrear', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 30; i++) stats.push(0.02);
    expect(stats.sample(out()).fps).toBeCloseTo(50, 5);
    expect(stats.sample(out()).fps).toBe(0);
  });

  it('ignora valores no finitos o no positivos', () => {
    const stats = new FrameStats();
    stats.push(NaN);
    stats.push(Infinity);
    stats.push(0);
    stats.push(-1);
    expect(stats.sample(out())).toEqual({ fps: 0, meanMs: 0, p95Ms: 0 });
    stats.push(0.01);
    expect(stats.sample(out()).meanMs).toBeCloseTo(10, 4);
  });

  it('reset borra historial y ventana', () => {
    const stats = new FrameStats();
    stats.push(0.016);
    stats.reset();
    expect(stats.sample(out())).toEqual({ fps: 0, meanMs: 0, p95Ms: 0 });
  });
});
