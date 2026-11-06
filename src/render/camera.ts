import { Vector3, type PerspectiveCamera } from 'three';
import { dampFactor, lerpAngle } from '../core/math';
import { CAMERA } from '../data/balance';

/**
 * Cámara de persecución. Sigue al coche con suavizado exponencial independiente de los FPS,
 * sin giros bruscos. Con "Reducir movimiento" va más pegada al coche (menos balanceo y retardo).
 */
export class ChaseCamera {
  private heading = 0;
  private readonly position = new Vector3();
  private readonly desired = new Vector3();
  private readonly lookAt = new Vector3();
  private initialized = false;

  constructor(private readonly camera: PerspectiveCamera) {}

  /** Coloca la cámara directamente en su sitio (al empezar o tras reaparecer). */
  snap(x: number, z: number, heading: number): void {
    this.heading = heading;
    this.computeDesired(x, z);
    this.position.copy(this.desired);
    this.apply(x, z);
    this.initialized = true;
  }

  update(x: number, z: number, heading: number, dt: number, reducedMotion: boolean): void {
    if (!this.initialized) {
      this.snap(x, z, heading);
      return;
    }
    const headingRate = reducedMotion ? CAMERA.reducedHeadingRate : CAMERA.headingRate;
    const positionRate = reducedMotion ? CAMERA.reducedPositionRate : CAMERA.positionRate;
    this.heading = lerpAngle(this.heading, heading, dampFactor(headingRate, dt));
    this.computeDesired(x, z);
    this.position.lerp(this.desired, dampFactor(positionRate, dt));
    this.apply(x, z);
  }

  private computeDesired(x: number, z: number): void {
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    this.desired.set(x - fx * CAMERA.distance, CAMERA.height, z - fz * CAMERA.distance);
  }

  private apply(x: number, z: number): void {
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    this.camera.position.copy(this.position);
    this.lookAt.set(x + fx * CAMERA.lookAhead, CAMERA.lookHeight, z + fz * CAMERA.lookAhead);
    this.camera.lookAt(this.lookAt);
  }
}
