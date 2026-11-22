import { EFFECTS } from '../data/balance';
import { RateLimiter, skidIntensity } from '../game/feedback';
import type { Racer } from '../game/racer';
import type { ParticleEffects } from '../render/particles';

/** Pose de un coche para el render, con la altura y la inclinación que da la pista. */
export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
}

/** Derrape mínimo (0..1) que enciende el indicador, deja marcas o suena. */
export const DRIFT_THRESHOLD = 0.25;

/**
 * Efectos de los coches: golpes acumulados en los pasos del frame, humo y marcas de derrape en las ruedas
 * traseras y chispas al chocar. Guarda el estado por coche (presupuesto de humo y golpes).
 */
export class RacerEffects {
  private smokeBudget: number[] = [];
  private stepImpacts: number[] = [];
  private readonly sparkLimiter = new RateLimiter(EFFECTS.sparkInterval);

  /** Prepara el estado para `count` coches. */
  resetRacers(count: number): void {
    this.smokeBudget = new Array<number>(count).fill(0);
    this.stepImpacts = new Array<number>(count).fill(0);
  }

  /** Golpe más fuerte del jugador en los pasos de este frame. */
  get playerImpact(): number {
    return this.stepImpacts[0] ?? 0;
  }

  clearImpacts(): void {
    this.stepImpacts.fill(0);
  }

  /** Acumula los golpes de cada coche en el último paso (para chispas, sacudida y sonido). */
  recordImpacts(racers: readonly Racer[]): void {
    for (let k = 0; k < racers.length; k++) {
      const racer = racers[k];
      if (!racer) continue;
      const impact = Math.max(racer.car.wallImpact, racer.carImpact);
      this.stepImpacts[k] = Math.max(this.stepImpacts[k] ?? 0, impact);
    }
  }

  /** Avanza el limitador de chispas con el tiempo de efectos del frame. */
  update(dt: number): void {
    this.sparkLimiter.update(dt);
  }

  /** Humo y marcas de derrape en las ruedas traseras, y chispas al chocar. */
  emit(
    particles: ParticleEffects,
    racer: Racer,
    pose: Pose,
    dt: number,
    playing: boolean,
    reduced: boolean,
  ): void {
    const car = racer.car;
    const k = racer.index;
    const intensity = playing ? skidIntensity(car, racer.controls) : 0;
    const shape = racer.carDef.shape;
    const fx = Math.cos(pose.heading);
    const fz = -Math.sin(pose.heading);
    // Normal izquierda del coche: (fz, -fx).
    const back = -1.28 * shape.length;
    const side = 0.82 * shape.width;
    const skidding = intensity > DRIFT_THRESHOLD;
    for (let w = 0; w < 2; w++) {
      const s = w === 0 ? side : -side;
      const x = pose.x + fx * back + fz * s;
      const z = pose.z + fz * back - fx * s;
      // Altura de la rueda según el cabeceo y el balanceo del coche.
      const y =
        pose.y + back * Math.tan(pose.pitch) + s * Math.tan(pose.roll) + EFFECTS.skidMarkLift;
      particles.skid(k, w, skidding, x, y, z);
      if (!reduced && intensity > 0 && w === 0) {
        // Humo: emisión por segundo proporcional al derrape, repartida entre frames.
        const budget = (this.smokeBudget[k] ?? 0) + EFFECTS.smokeRate * intensity * dt;
        let count = Math.floor(budget);
        this.smokeBudget[k] = budget - count;
        while (count-- > 0) {
          const wheelSide = count % 2 === 0 ? s : -s;
          particles.emitSmoke(
            pose.x + fx * back + fz * wheelSide,
            pose.y,
            pose.z + fz * back - fx * wheelSide,
            car.vx,
            car.vz,
            intensity,
          );
        }
      }
    }
    const impact = this.stepImpacts[k] ?? 0;
    if (!reduced && impact >= EFFECTS.sparkMinImpact && this.sparkLimiter.tryFire()) {
      // Las chispas de un golpe contra el muro salen hacia la pista; las de un choque entre coches, hacia arriba.
      let nx = 0;
      let nz = 0;
      if (car.wallImpact >= racer.carImpact) {
        const sign = racer.query.lateral > 0 ? 1 : -1;
        nx = -racer.query.tangentZ * sign;
        nz = racer.query.tangentX * sign;
      }
      particles.burstSparks(pose.x, pose.y, pose.z, nx, nz, impact / 10);
    }
  }
}
