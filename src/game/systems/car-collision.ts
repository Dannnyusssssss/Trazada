import { carsOverlap, collideCars } from '../collision';
import type { System } from '../world';

/**
 * Colisión entre coches (empujón suave, sin daño). Un coche que acaba de reaparecer no choca hasta que
 * deja de tocar a los demás, para no aparecer encima de nadie.
 */
export const carCollisionSystem: System = (world) => {
  const racers = world.racers;
  for (let i = 0; i < racers.length; i++) {
    const a = racers[i];
    if (!a) continue;
    for (let j = i + 1; j < racers.length; j++) {
      const b = racers[j];
      if (!b || a.noCollide || b.noCollide) continue;
      const impact = collideCars(a.car, a.params.collisionRadius, b.car, b.params.collisionRadius);
      if (impact > 0) {
        a.carImpact = Math.max(a.carImpact, impact);
        b.carImpact = Math.max(b.carImpact, impact);
      }
    }
  }
  for (const racer of racers) {
    if (!racer.noCollide) continue;
    let touching = false;
    for (const other of racers) {
      if (other === racer) continue;
      const r = other.params.collisionRadius;
      if (carsOverlap(racer.car, racer.params.collisionRadius, other.car, r)) {
        touching = true;
        break;
      }
    }
    if (!touching) racer.noCollide = false;
  }
};
