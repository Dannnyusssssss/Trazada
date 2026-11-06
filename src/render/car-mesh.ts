import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type Material,
} from 'three';
import { GHOST } from '../data/balance';
import type { CarDef } from '../data/cars';

/** Ángulo visual máximo de las ruedas delanteras (rad). */
const MAX_VISUAL_STEER = 0.45;

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
 * Malla low-poly procedural del coche. El modelo mira hacia +Z local. Las ruedas giran según la velocidad
 * y las delanteras se orientan con el volante. En modo fantasma todos los materiales son translúcidos.
 */
export class CarMesh {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly wheelSpins: Group[] = [];
  private readonly frontPivots: Group[] = [];

  constructor(def: CarDef, ghost = false) {
    this.group.name = ghost ? `ghost-${def.id}` : `car-${def.id}`;
    const { length: L, width: W, cabin, wing } = def.shape;
    const translucent = (m: Material): Material => {
      if (ghost) {
        m.transparent = true;
        m.opacity = GHOST.opacity;
        m.depthWrite = false;
      }
      return m;
    };
    const paint = translucent(
      new MeshStandardMaterial({
        color: def.bodyColor,
        flatShading: true,
        roughness: 0.45,
        metalness: 0.15,
      }),
    );
    const accent = translucent(
      new MeshStandardMaterial({ color: def.accentColor, flatShading: true, roughness: 0.6 }),
    );
    const glass = translucent(
      new MeshStandardMaterial({
        color: 0x1b2433,
        flatShading: true,
        roughness: 0.2,
        metalness: 0.4,
      }),
    );
    const tire = translucent(new MeshLambertMaterial({ color: 0x1c1c20 }));
    const rim = translucent(new MeshLambertMaterial({ color: 0xc9ccd4 }));
    const headlight = translucent(new MeshLambertMaterial({ color: 0xfff6d8, emissive: 0x887a50 }));
    const taillight = translucent(new MeshLambertMaterial({ color: 0xb3261e, emissive: 0x4a0d0a }));

    // Carrocería: base, morro en cuña y cabina estrechada.
    const bodyMesh = new Mesh(
      taperTop(new BoxGeometry(1.9 * W, 0.5, 4.1 * L), 0.96, 0.97, -0.05),
      paint,
    );
    bodyMesh.position.y = 0.55;
    const nose = new Mesh(taperTop(new BoxGeometry(1.8 * W, 0.22, 1.1 * L), 0.9, 0.6, -0.2), paint);
    nose.position.set(0, 0.88, 1.35 * L);
    const cabinMesh = new Mesh(
      taperTop(new BoxGeometry(1.6 * W, 0.55, 2.0 * cabin), 0.82, 0.62, -0.15),
      glass,
    );
    cabinMesh.position.set(0, 1.07, -0.35 * L);
    const stripe = new Mesh(new BoxGeometry(0.45, 0.02, 4.12 * L), accent);
    stripe.position.set(0, 0.81, 0);
    this.body.add(bodyMesh, nose, cabinMesh, stripe);

    // Alerón trasero (bajo, alto o ninguno según el coche).
    if (wing !== 'none') {
      const wingY = wing === 'high' ? 1.42 : 1.18;
      const wingMesh = new Mesh(new BoxGeometry(1.8 * W, 0.07, 0.42), accent);
      wingMesh.position.set(0, wingY, -1.9 * L);
      const postGeometry = new BoxGeometry(0.08, wingY - 0.86, 0.2);
      this.body.add(wingMesh);
      for (const x of [-0.6, 0.6]) {
        const post = new Mesh(postGeometry, accent);
        post.position.set(x * W, (wingY + 0.8) / 2, -1.85 * L);
        this.body.add(post);
      }
    }
    // Faros y pilotos (luz fija, sin parpadeos).
    const lampGeometry = new BoxGeometry(0.42, 0.14, 0.05);
    for (const x of [-0.62, 0.62]) {
      const front = new Mesh(lampGeometry, headlight);
      front.position.set(x * W, 0.66, 2.06 * L);
      const back = new Mesh(lampGeometry, taillight);
      back.position.set(x * W, 0.68, -2.06 * L);
      this.body.add(front, back);
    }

    // Ruedas: el giro (spin) va en un grupo propio y las delanteras cuelgan de un pivote de dirección.
    const tireGeometry = new CylinderGeometry(0.36, 0.36, 0.3, 12);
    tireGeometry.rotateZ(Math.PI / 2);
    const rimGeometry = new BoxGeometry(0.32, 0.12, 0.5);
    const trackHalf = 0.82 * W;
    const wheelbaseHalf = 1.28 * L;
    for (const [x, z, front] of [
      [trackHalf, wheelbaseHalf, true],
      [-trackHalf, wheelbaseHalf, true],
      [trackHalf, -wheelbaseHalf, false],
      [-trackHalf, -wheelbaseHalf, false],
    ] as const) {
      const pivot = new Group();
      pivot.position.set(x, 0.36, z);
      const spin = new Group();
      spin.add(new Mesh(tireGeometry, tire));
      const hub = new Mesh(rimGeometry, rim);
      hub.position.x = x > 0 ? 0.02 : -0.02;
      spin.add(hub);
      pivot.add(spin);
      this.body.add(pivot);
      this.wheelSpins.push(spin);
      if (front) this.frontPivots.push(pivot);
    }
    this.body.traverse((obj) => {
      if (obj instanceof Mesh) obj.castShadow = !ghost;
    });
    this.group.add(this.body);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /**
   * Coloca el coche: posición, rumbo del juego, cabeceo (positivo = morro arriba), balanceo
   * (positivo = lado izquierdo arriba), volante y giro de ruedas.
   */
  update(
    x: number,
    y: number,
    z: number,
    heading: number,
    pitch: number,
    roll: number,
    steer: number,
    wheelAngle: number,
  ): void {
    this.group.position.set(x, y, z);
    // El modelo mira a +Z: rotation.y = rumbo + 90° alinea +Z con (cos h, -sin h).
    this.group.rotation.set(0, heading + Math.PI / 2, 0);
    // Rotar +X baja el morro, así que el cabeceo va con signo contrario; +Z sube el lado izquierdo.
    this.body.rotation.set(-pitch, 0, roll, 'XYZ');
    for (const spin of this.wheelSpins) spin.rotation.x = wheelAngle;
    for (const pivot of this.frontPivots) pivot.rotation.y = steer * MAX_VISUAL_STEER;
  }
}
