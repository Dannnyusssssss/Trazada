/**
 * Generador pseudoaleatorio con semilla (mulberry32). Toda la aleatoriedad del juego pasa por aquí:
 * la misma semilla produce siempre la misma secuencia, en cualquier navegador.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Número en [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Número en [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entero en [min, max] (ambos incluidos). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}
