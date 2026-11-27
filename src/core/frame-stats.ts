/** Estadísticas de tiempo de frame (lógica pura, sin DOM ni relojes). */

export interface FrameStatsSnapshot {
  fps: number;
  meanMs: number;
  p95Ms: number;
}

export class FrameStats {
  /** Historial circular de duraciones de frame (ms) y copia para ordenarlo sin crear arreglos. */
  private readonly history: Float32Array;
  private readonly sorted: Float32Array;
  private count = 0;
  private index = 0;
  /** Contadores de la ventana de FPS (desde la última muestra). */
  private frames = 0;
  private windowTime = 0;

  constructor(private readonly historySize = 240) {
    this.history = new Float32Array(historySize);
    this.sorted = new Float32Array(historySize);
  }

  /** Registra un frame (s). Ignora valores no finitos o <= 0. */
  push(frameSeconds: number): void {
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0) return;
    this.frames++;
    this.windowTime += frameSeconds;
    this.history[this.index] = frameSeconds * 1000;
    this.index = (this.index + 1) % this.historySize;
    if (this.count < this.historySize) this.count++;
  }

  /** Escribe en `out` los valores actuales y reinicia la ventana de FPS. */
  sample(out: FrameStatsSnapshot): FrameStatsSnapshot {
    out.fps = this.windowTime > 0 ? this.frames / this.windowTime : 0;
    this.frames = 0;
    this.windowTime = 0;
    const n = this.count;
    if (n === 0) {
      out.meanMs = 0;
      out.p95Ms = 0;
      return out;
    }
    const view = this.sorted.subarray(0, n);
    view.set(this.history.subarray(0, n));
    view.sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += view[i] ?? 0;
    out.meanMs = sum / n;
    out.p95Ms = view[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0;
    return out;
  }

  reset(): void {
    this.count = 0;
    this.index = 0;
    this.frames = 0;
    this.windowTime = 0;
  }
}
