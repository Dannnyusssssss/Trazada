import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Scene,
} from 'three';
import { Rng } from '../core/rng';
import { EFFECTS } from '../data/balance';
import { disposeObject } from './dispose';

const ZERO_MATRIX = new Matrix4().makeScale(0, 0, 0);

/** Grupo de partículas de tamaño fijo dibujado con una sola malla instanciada. */
class ParticlePool {
  readonly mesh: InstancedMesh;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private alive = 0;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly direction = new Vector3();
  private readonly forward = new Vector3(0, 0, 1);

  constructor(
    geometry: BufferGeometry,
    material: MeshBasicMaterial,
    private readonly capacity: number,
    private readonly life: number,
    /** Humo: crece y luego encoge, sube despacio. Chispas: encogen y caen. */
    private readonly kind: 'smoke' | 'spark',
  ) {
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(capacity);
    this.py = new Float32Array(capacity);
    this.pz = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.vz = new Float32Array(capacity);
    this.age = new Float32Array(capacity).fill(life);
    this.size = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) this.mesh.setMatrixAt(i, ZERO_MATRIX);
  }

  /** Añade una partícula; si el grupo está lleno, reutiliza la más antigua. */
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    if ((this.age[i] ?? this.life) >= this.life) this.alive++;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.age[i] = 0;
    this.size[i] = size;
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      const age = (this.age[i] ?? this.life) + dt;
      if (age >= this.life) {
        if ((this.age[i] ?? this.life) < this.life) this.mesh.setMatrixAt(i, ZERO_MATRIX);
        this.age[i] = this.life;
        continue;
      }
      alive++;
      this.age[i] = age;
      const t = age / this.life;
      if (this.kind === 'smoke') {
        // El humo frena, sube despacio y se expande; al final encoge para desaparecer sin cortes.
        const drag = Math.exp(-2.2 * dt);
        this.vx[i] = (this.vx[i] ?? 0) * drag;
        this.vz[i] = (this.vz[i] ?? 0) * drag;
        this.vy[i] = (this.vy[i] ?? 0) * drag + 0.6 * dt;
      } else {
        // Las chispas caen con la gravedad.
        this.vy[i] = (this.vy[i] ?? 0) - 9.8 * dt;
      }
      this.px[i] = (this.px[i] ?? 0) + (this.vx[i] ?? 0) * dt;
      this.py[i] = (this.py[i] ?? 0) + (this.vy[i] ?? 0) * dt;
      this.pz[i] = (this.pz[i] ?? 0) + (this.vz[i] ?? 0) * dt;
      const base = this.size[i] ?? 1;
      const s = this.kind === 'smoke' ? base * (0.6 + 1.6 * t) * (1 - t * t) : base * (1 - t);
      this.position.set(this.px[i] ?? 0, this.py[i] ?? 0, this.pz[i] ?? 0);
      if (this.kind === 'spark') {
        // La chispa se alarga en la dirección en la que se mueve.
        this.direction.set(this.vx[i] ?? 0, this.vy[i] ?? 0, this.vz[i] ?? 1).normalize();
        this.rotation.setFromUnitVectors(this.forward, this.direction);
      } else {
        this.rotation.identity();
      }
      this.scale.set(s, s, s);
      this.matrix.compose(this.position, this.rotation, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    }
    this.alive = alive;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.age[i] = this.life;
      this.mesh.setMatrixAt(i, ZERO_MATRIX);
    }
    this.alive = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Marcas de derrape: un búfer circular de tramos (cuadriláteros planos sobre la pista) en una sola
 * geometría. Cuando se llena, los tramos nuevos sustituyen a los más antiguos.
 */
class SkidMarks {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly attribute: BufferAttribute;
  private next = 0;
  private used = 0;

  constructor(private readonly capacity: number) {
    this.positions = new Float32Array(capacity * 4 * 3);
    const index = new Uint32Array(capacity * 6);
    for (let k = 0; k < capacity; k++) {
      const v = k * 4;
      index.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], k * 6);
    }
    const geometry = new BufferGeometry();
    this.attribute = new BufferAttribute(this.positions, 3);
    this.attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.attribute);
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.setDrawRange(0, 0);
    this.mesh = new Mesh(
      geometry,
      new MeshBasicMaterial({
        color: 0x15171d,
        transparent: true,
        opacity: EFFECTS.skidMarkOpacity,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Añade un tramo de (x0, y0, z0) a (x1, y1, z1). */
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) return;
    // Media anchura en la dirección perpendicular al tramo, en el suelo.
    const w = EFFECTS.skidMarkWidth / 2;
    const nx = (-dz / length) * w;
    const nz = (dx / length) * w;
    const o = this.next * 12;
    const p = this.positions;
    p[o] = x0 + nx;
    p[o + 1] = y0;
    p[o + 2] = z0 + nz;
    p[o + 3] = x0 - nx;
    p[o + 4] = y0;
    p[o + 5] = z0 - nz;
    p[o + 6] = x1 + nx;
    p[o + 7] = y1;
    p[o + 8] = z1 + nz;
    p[o + 9] = x1 - nx;
    p[o + 10] = y1;
    p[o + 11] = z1 - nz;
    this.next = (this.next + 1) % this.capacity;
    this.used = Math.min(this.capacity, this.used + 1);
    this.mesh.geometry.setDrawRange(0, this.used * 6);
    this.attribute.needsUpdate = true;
  }

  clear(): void {
    this.next = 0;
    this.used = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}

/**
 * Efectos de partículas del circuito: humo y marcas al derrapar y chispas al chocar. Todo tiene tamaño fijo
 * (no se crean objetos durante la carrera). Las chispas son pequeñas, de color cálido y con un tope de
 * ráfagas por segundo que decide quien llama.
 */
export class ParticleEffects {
  readonly group = new Group();
  private readonly smoke: ParticlePool;
  private readonly sparks: ParticlePool;
  private readonly marks: SkidMarks;
  private readonly rng = new Rng(0x5eed);
  /** Último punto de cada rueda trasera que deja marca (x, y, z) y si es válido, por coche y rueda. */
  private readonly lastWheel: Float32Array;
  private readonly lastValid: Uint8Array;

  constructor(
    private readonly scene: Scene,
    maxCars: number,
  ) {
    this.smoke = new ParticlePool(
      new IcosahedronGeometry(0.5, 0),
      // Sin iluminación: con sombreado, las bocanadas facetadas parecían rocas.
      new MeshBasicMaterial({
        color: 0xe4e5ea,
        transparent: true,
        opacity: EFFECTS.smokeOpacity,
        depthWrite: false,
      }),
      EFFECTS.smokeCount,
      EFFECTS.smokeLife,
      'smoke',
    );
    this.sparks = new ParticlePool(
      new BoxGeometry(0.05, 0.05, 0.32),
      new MeshBasicMaterial({ color: 0xffc35a }),
      EFFECTS.sparkCount,
      EFFECTS.sparkLife,
      'spark',
    );
    this.marks = new SkidMarks(EFFECTS.skidMarkCount);
    this.lastWheel = new Float32Array(maxCars * 2 * 3);
    this.lastValid = new Uint8Array(maxCars * 2);
    this.group.add(this.marks.mesh, this.smoke.mesh, this.sparks.mesh);
    scene.add(this.group);
  }

  /** Humo del derrape en un punto, con la intensidad (0..1) y la velocidad del coche. */
  emitSmoke(x: number, y: number, z: number, vx: number, vz: number, intensity: number): void {
    const r = this.rng;
    this.smoke.spawn(
      x + r.range(-0.2, 0.2),
      y + 0.25,
      z + r.range(-0.2, 0.2),
      vx * 0.25 + r.range(-0.6, 0.6),
      r.range(0.3, 0.8),
      vz * 0.25 + r.range(-0.6, 0.6),
      EFFECTS.smokeSize * (0.7 + 0.5 * intensity),
    );
  }

  /** Ráfaga de chispas en un punto, hacia fuera según (nx, nz). */
  burstSparks(x: number, y: number, z: number, nx: number, nz: number, strength: number): void {
    const r = this.rng;
    const count = Math.round(EFFECTS.sparkBurst * Math.min(1, 0.4 + strength));
    for (let i = 0; i < count; i++) {
      const speed = r.range(2, 6);
      this.sparks.spawn(
        x,
        y + 0.4,
        z,
        nx * speed + r.range(-2, 2),
        r.range(1.5, 4),
        nz * speed + r.range(-2, 2),
        r.range(0.7, 1.2),
      );
    }
  }

  /**
   * Marca de una rueda trasera (`wheel` 0 o 1) de un coche. Con `skidding` en false se corta la marca.
   * Un salto grande (reaparición) también la corta.
   */
  skid(car: number, wheel: number, skidding: boolean, x: number, y: number, z: number): void {
    const k = car * 2 + wheel;
    if (k >= this.lastValid.length) return;
    const o = k * 3;
    if (!skidding) {
      this.lastValid[k] = 0;
      return;
    }
    if (this.lastValid[k] === 0) {
      this.lastWheel[o] = x;
      this.lastWheel[o + 1] = y;
      this.lastWheel[o + 2] = z;
      this.lastValid[k] = 1;
      return;
    }
    const x0 = this.lastWheel[o] ?? x;
    const y0 = this.lastWheel[o + 1] ?? y;
    const z0 = this.lastWheel[o + 2] ?? z;
    const d = Math.hypot(x - x0, z - z0);
    if (d < EFFECTS.skidMarkSegment) return;
    if (d < 4) this.marks.add(x0, y0, z0, x, y, z);
    this.lastWheel[o] = x;
    this.lastWheel[o + 1] = y;
    this.lastWheel[o + 2] = z;
  }

  update(dt: number): void {
    this.smoke.update(dt);
    this.sparks.update(dt);
  }

  /** Quita todo (al reiniciar la carrera). */
  clear(): void {
    this.smoke.clear();
    this.sparks.clear();
    this.marks.clear();
    this.lastValid.fill(0);
  }

  dispose(): void {
    this.scene.remove(this.group);
    // Las mallas instanciadas liberan también su búfer de matrices.
    this.smoke.mesh.dispose();
    this.sparks.mesh.dispose();
    disposeObject(this.group);
  }
}
