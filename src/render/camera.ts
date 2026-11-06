import { Vector3, type PerspectiveCamera } from 'three';
import { dampFactor, lerp, lerpAngle } from '../core/math';
import { CAMERA } from '../data/balance';

export type CameraMode = 'chase' | 'high';

/**
 * Cámara de persecución con dos vistas (detrás y alta). Sigue al coche con suavizado exponencial
 * independiente de los FPS, sin giros bruscos. Con "Reducir movimiento" va más pegada al coche y el cambio
 * de vista es un corte directo en lugar de una transición.
 */
export class ChaseCamera {
  private heading = 0;
  private y = 0;
  /** 0 = vista de persecución, 1 = vista alta; se acerca suavemente a la vista elegida. */
  private blend = 0;
  private mode: CameraMode = 'chase';
  private readonly position = new Vector3();
  private readonly desired = new Vector3();
  private readonly lookAt = new Vector3();
  private initialized = false;

  constructor(private readonly camera: PerspectiveCamera) {}

  setMode(mode: CameraMode, immediate: boolean): void {
    this.mode = mode;
    if (immediate) this.blend = mode === 'high' ? 1 : 0;
  }

  /** Coloca la cámara directamente en su sitio (al empezar o tras reaparecer). */
  snap(x: number, y: number, z: number, heading: number): void {
    this.heading = heading;
    this.y = y;
    this.blend = this.mode === 'high' ? 1 : 0;
    this.computeDesired(x, z);
    this.position.copy(this.desired);
    this.apply(x, z);
    this.initialized = true;
  }

  update(
    x: number,
    y: number,
    z: number,
    heading: number,
    dt: number,
    reducedMotion: boolean,
  ): void {
    if (!this.initialized) {
      this.snap(x, y, z, heading);
      return;
    }
    const headingRate = reducedMotion ? CAMERA.reducedHeadingRate : CAMERA.headingRate;
    const positionRate = reducedMotion ? CAMERA.reducedPositionRate : CAMERA.positionRate;
    const target = this.mode === 'high' ? 1 : 0;
    this.blend = reducedMotion
      ? target
      : lerp(this.blend, target, dampFactor(CAMERA.switchRate, dt));
    this.heading = lerpAngle(this.heading, heading, dampFactor(headingRate, dt));
    this.y = lerp(this.y, y, dampFactor(positionRate, dt));
    this.computeDesired(x, z);
    this.position.lerp(this.desired, dampFactor(positionRate, dt));
    this.apply(x, z);
  }

  private computeDesired(x: number, z: number): void {
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    const distance = lerp(CAMERA.distance, CAMERA.highDistance, this.blend);
    const height = lerp(CAMERA.height, CAMERA.highHeight, this.blend);
    this.desired.set(x - fx * distance, this.y + height, z - fz * distance);
  }

  private apply(x: number, z: number): void {
    const fx = Math.cos(this.heading);
    const fz = -Math.sin(this.heading);
    const ahead = lerp(CAMERA.lookAhead, CAMERA.highLookAhead, this.blend);
    this.camera.position.copy(this.position);
    this.lookAt.set(x + fx * ahead, this.y + CAMERA.lookHeight, z + fz * ahead);
    this.camera.lookAt(this.lookAt);
  }
}
