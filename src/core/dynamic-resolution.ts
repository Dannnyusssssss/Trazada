/**
 * Resolución dinámica como lógica pura: recibe la duración de cada frame y decide cuándo bajar un escalón
 * de la escala de resolución interna. No toca el render; quien la usa aplica la escala y la guarda.
 */

export interface DynamicResolutionConfig {
  /** Escalones de escala, de mayor a menor. El primero suele ser 1. */
  readonly scales: readonly number[];
  readonly minFps: number;
  readonly windowSeconds: number;
  readonly sustainSeconds: number;
  readonly settleSeconds: number;
  readonly maxFrameSeconds: number;
}

export class DynamicResolution {
  private level = 0;
  private windowTime = 0;
  private windowFrames = 0;
  private slowTime = 0;
  private settle: number;

  constructor(
    private readonly config: DynamicResolutionConfig,
    initialScale = 1,
  ) {
    this.settle = config.settleSeconds;
    this.setScale(initialScale);
  }

  /** Escala actual (fracción del pixel ratio). */
  get scale(): number {
    return this.config.scales[this.level] ?? 1;
  }

  /** Coloca el escalón más cercano a `scale` y reinicia la medición. */
  setScale(scale: number): void {
    const scales = this.config.scales;
    let best = 0;
    for (let i = 1; i < scales.length; i++) {
      const s = scales[i] ?? 1;
      if (Math.abs(s - scale) < Math.abs((scales[best] ?? 1) - scale)) best = i;
    }
    this.level = Number.isFinite(scale) ? best : 0;
    this.restart();
  }

  /** Reinicia la medición (al empezar a jugar, al volver de la pausa o tras un cambio de escala). */
  restart(): void {
    this.windowTime = 0;
    this.windowFrames = 0;
    this.slowTime = 0;
    this.settle = this.config.settleSeconds;
  }

  /**
   * Cuenta un frame de juego. Devuelve true si la escala acaba de bajar un escalón.
   * Los frames muy largos (tirones aislados) no se miden.
   */
  update(frameSeconds: number): boolean {
    const c = this.config;
    if (!Number.isFinite(frameSeconds) || frameSeconds <= 0 || frameSeconds > c.maxFrameSeconds) {
      return false;
    }
    if (this.settle > 0) {
      this.settle -= frameSeconds;
      return false;
    }
    this.windowTime += frameSeconds;
    this.windowFrames++;
    if (this.windowTime < c.windowSeconds) return false;
    const fps = this.windowFrames / this.windowTime;
    // Cada ventana lenta suma su duración; una sola ventana rápida corta la racha.
    this.slowTime = fps < c.minFps ? this.slowTime + this.windowTime : 0;
    this.windowTime = 0;
    this.windowFrames = 0;
    if (this.slowTime < c.sustainSeconds || this.level >= c.scales.length - 1) return false;
    this.level++;
    this.restart();
    return true;
  }
}
