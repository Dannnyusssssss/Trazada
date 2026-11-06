import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
} from 'three';
import type { CarDef } from '../data/cars';

/** Ángulo visual máximo de las ruedas delanteras (rad). */
const MAX_VISUAL_STEER = 0.45;
const TRACK_HALF = 0.82;
const WHEELBASE_HALF = 1.28;

/** Estrecha la parte superior de una caja para dar forma de cabina inclinada. */
function taperTop(
  geometry: BufferGeometry,
  scaleX: number,
  scaleZ: number,
  shiftZ: number,
): BufferGeometry {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) {
      position.setX(i, position.getX(i) * scaleX);
      position.setZ(i, position.getZ(i) * scaleZ + shiftZ);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Malla low-poly procedural del coche. El modelo mira hacia +Z local.
 * Las ruedas giran según la velocidad y las delanteras se orientan con el volante.
 */
export class CarMesh {
  readonly group = new Group();
  private readonly wheelSpins: Group[] = [];
  private readonly frontPivots: Group[] = [];

  constructor(def: CarDef) {
    this.group.name = `car-${def.id}`;
    const paint = new MeshStandardMaterial({
      color: def.bodyColor,
      flatShading: true,
      roughness: 0.45,
      metalness: 0.15,
    });
    const accent = new MeshStandardMaterial({
      color: def.accentColor,
      flatShading: true,
      roughness: 0.6,
    });
    const glass = new MeshStandardMaterial({
      color: 0x1b2433,
      flatShading: true,
      roughness: 0.2,
      metalness: 0.4,
    });
    const tire = new MeshLambertMaterial({ color: 0x1c1c20 });
    const rim = new MeshLambertMaterial({ color: 0xc9ccd4 });
    const headlight = new MeshLambertMaterial({ color: 0xfff6d8, emissive: 0x887a50 });
    const taillight = new MeshLambertMaterial({ color: 0xb3261e, emissive: 0x4a0d0a });

    // Carrocería: base, morro en cuña y cabina estrechada.
    const body = new Mesh(taperTop(new BoxGeometry(1.9, 0.5, 4.1), 0.96, 0.97, -0.05), paint);
    body.position.y = 0.55;
    const nose = new Mesh(taperTop(new BoxGeometry(1.8, 0.22, 1.1), 0.9, 0.6, -0.2), paint);
    nose.position.set(0, 0.88, 1.35);
    const cabin = new Mesh(taperTop(new BoxGeometry(1.6, 0.55, 2.0), 0.82, 0.62, -0.15), glass);
    cabin.position.set(0, 1.07, -0.35);
    const stripe = new Mesh(new BoxGeometry(0.45, 0.02, 4.12), accent);
    stripe.position.set(0, 0.81, 0);
    // Alerón trasero.
    const wing = new Mesh(new BoxGeometry(1.8, 0.07, 0.42), accent);
    wing.position.set(0, 1.18, -1.9);
    const wingPostGeometry = new BoxGeometry(0.08, 0.32, 0.2);
    const posts = [-0.6, 0.6].map((x) => {
      const post = new Mesh(wingPostGeometry, accent);
      post.position.set(x, 0.98, -1.85);
      return post;
    });
    // Faros y pilotos (luz fija, sin parpadeos).
    const lampGeometry = new BoxGeometry(0.42, 0.14, 0.05);
    const lamps = [-0.62, 0.62].flatMap((x) => {
      const front = new Mesh(lampGeometry, headlight);
      front.position.set(x, 0.66, 2.06);
      const back = new Mesh(lampGeometry, taillight);
      back.position.set(x, 0.68, -2.06);
      return [front, back];
    });
    this.group.add(body, nose, cabin, stripe, wing, ...posts, ...lamps);

    // Ruedas: el giro (spin) va en un grupo propio y las delanteras cuelgan de un pivote de dirección.
    const tireGeometry = new CylinderGeometry(0.36, 0.36, 0.3, 12);
    tireGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new BoxGeometry(0.32, 0.12, 0.5);
    for (const [x, z, front] of [
      [TRACK_HALF, WHEELBASE_HALF, true],
      [-TRACK_HALF, WHEELBASE_HALF, true],
      [TRACK_HALF, -WHEELBASE_HALF, false],
      [-TRACK_HALF, -WHEELBASE_HALF, false],
    ] as const) {
      const pivot = new Group();
      pivot.position.set(x, 0.36, z);
      const spin = new Group();
      spin.add(new Mesh(tireGeometry, tire));
      const hub = new Mesh(rimGeometry, rim);
      hub.position.x = x > 0 ? 0.02 : -0.02;
      spin.add(hub);
      pivot.add(spin);
      this.group.add(pivot);
      this.wheelSpins.push(spin);
      if (front) this.frontPivots.push(pivot);
    }
  }

  /** Coloca el coche: posición en el plano, rumbo del juego, volante y giro de ruedas. */
  update(x: number, z: number, heading: number, steer: number, wheelAngle: number): void {
    this.group.position.set(x, 0, z);
    // El modelo mira a +Z: rotation.y = rumbo + 90° alinea +Z con (cos h, -sin h).
    this.group.rotation.y = heading + Math.PI / 2;
    for (const spin of this.wheelSpins) spin.rotation.x = wheelAngle;
    for (const pivot of this.frontPivots) pivot.rotation.y = steer * MAX_VISUAL_STEER;
  }
}
