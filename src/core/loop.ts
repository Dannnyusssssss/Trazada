/**
 * Acumulador de timestep fijo. La lógica avanza siempre en pasos de `stepSeconds`, sin importar la frecuencia
 * del monitor; el render usa `alpha` para interpolar entre el estado anterior y el actual.
 */
export class FixedStepAccumulator {
  private accumulator = 0;
  private lastAlpha = 0;

  constructor(
    readonly stepSeconds: number,
    /** Tope de pasos por frame: evita la "espiral de la muerte" si un frame tarda mucho. */
    readonly maxStepsPerFrame: number,
    /** Tope del tiempo de un frame (por ejemplo, al volver de otra pestaña). */
    readonly maxFrameSeconds = 0.25,
  ) {}

  /** Suma el tiempo real del frame y devuelve cuántos pasos fijos hay que simular ahora. */
  advance(frameSeconds: number): number {
    const dt = Number.isFinite(frameSeconds)
      ? Math.min(Math.max(frameSeconds, 0), this.maxFrameSeconds)
      : 0;
    this.accumulator += dt;
    let steps = Math.floor(this.accumulator / this.stepSeconds + 1e-9);
    if (steps > this.maxStepsPerFrame) {
      // Se descarta el tiempo sobrante: el juego va más lento un instante en vez de bloquearse.
      steps = this.maxStepsPerFrame;
      this.accumulator = 0;
    } else {
      this.accumulator = Math.max(0, this.accumulator - steps * this.stepSeconds);
    }
    this.lastAlpha = Math.min(this.accumulator / this.stepSeconds, 1);
    return steps;
  }

  /** Fracción [0, 1] del siguiente paso ya transcurrida, para interpolar el render. */
  get alpha(): number {
    return this.lastAlpha;
  }

  reset(): void {
    this.accumulator = 0;
    this.lastAlpha = 0;
  }
}
