import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EFFECTS, GHOST } from '../data/balance';
import type { CarDef } from '../data/cars';

/** Ángulo visual máximo de las ruedas delanteras (rad). */
const MAX_VISUAL_STEER = 0.45;

const GLASS_COLOR = 0x1b2433;
const TIRE_COLOR = 0x1c1c20;
const RIM_COLOR = 0xc9ccd4;

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

/** Coloca una pieza (la traslada) y le pinta un color por vértice, para fusionarla con otras. */
function part(
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
  color: number,
): BufferGeometry {
  geometry.translate(x, y, z);
  const c = new Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}

/** Fusiona piezas en una sola geometría y libera las originales. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('No se pudo fusionar la malla del coche');
  return merged;
}

/** Textura del haz de los faros: un degradado suave, sin bordes duros. */
function beamTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(32, 120, 4, 32, 90, 90);
    gradient.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
    gradient.addColorStop(0.45, 'rgba(255, 236, 190, 0.35)');
    gradient.addColorStop(1, 'rgba(255, 230, 180, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 128);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export interface CarMeshOptions {
  /** Fantasma: todos los materiales translúcidos y sin sombras. */
  ghost?: boolean;
  /** Color de carrocería (los rivales usan uno propio); por defecto el del coche. */
  bodyColor?: number;
  /** Circuito nocturno: faros encendidos con haz sobre el asfalto. */
  night?: boolean;
}

/**
 * Malla low-poly procedural del coche. El modelo mira hacia +Z local. Las piezas fijas se fusionan en una
 * sola geometría con colores por vértice (pocas llamadas de dibujo aunque haya 6 coches); las ruedas giran
 * según la velocidad y las delanteras se orientan con el volante. En modo fantasma todo es translúcido.
 * Las luces de freno se encienden con un fundido que decide quien llama (nunca parpadean rápido).
 */
export class CarMesh {
  readonly group = new Group();
  private readonly body = new Group();
  private readonly wheelSpins: Group[] = [];
  private readonly frontPivots: Group[] = [];
  private readonly taillight: MeshLambertMaterial;
  private readonly beam: Mesh | null = null;

  constructor(def: CarDef, options: CarMeshOptions = {}) {
    const ghost = options.ghost ?? false;
    const night = options.night ?? false;
    this.group.name = ghost ? `ghost-${def.id}` : `car-${def.id}`;
    const { length: L, width: W, cabin, wing } = def.shape;
    const translucent = <T extends Material>(m: T): T => {
      if (ghost) {
        m.transparent = true;
        m.opacity = GHOST.opacity;
        m.depthWrite = false;
      }
      return m;
    };
    const bodyColor = options.bodyColor ?? def.bodyColor;
    const paintMaterial = translucent(
      new MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.45,
        metalness: 0.15,
      }),
    );
    const headlight = translucent(
      new MeshLambertMaterial({
        color: 0xfff6d8,
        emissive: 0xfff0c8,
        emissiveIntensity: night ? EFFECTS.headlightNight : EFFECTS.headlightDay,
      }),
    );
    this.taillight = translucent(
      new MeshLambertMaterial({
        color: 0xb3261e,
        emissive: 0xff2a1a,
        emissiveIntensity: EFFECTS.taillightIdle,
      }),
    );
    const wheelMaterial = translucent(new MeshLambertMaterial({ vertexColors: true }));

    // Carrocería: base, morro en cuña, cabina estrechada, franja y alerón, fusionados en una malla.
    const parts: BufferGeometry[] = [
      part(
        taperTop(new BoxGeometry(1.9 * W, 0.5, 4.1 * L), 0.96, 0.97, -0.05),
        0,
        0.55,
        0,
        bodyColor,
      ),
      part(
        taperTop(new BoxGeometry(1.8 * W, 0.22, 1.1 * L), 0.9, 0.6, -0.2),
        0,
        0.88,
        1.35 * L,
        bodyColor,
      ),
      part(
        taperTop(new BoxGeometry(1.6 * W, 0.55, 2.0 * cabin), 0.82, 0.62, -0.15),
        0,
        1.07,
        -0.35 * L,
        GLASS_COLOR,
      ),
      part(new BoxGeometry(0.45, 0.02, 4.12 * L), 0, 0.81, 0, def.accentColor),
    ];
    // Alerón trasero (bajo, alto o ninguno según el coche).
    if (wing !== 'none') {
      const wingY = wing === 'high' ? 1.42 : 1.18;
      parts.push(part(new BoxGeometry(1.8 * W, 0.07, 0.42), 0, wingY, -1.9 * L, def.accentColor));
      for (const x of [-0.6, 0.6]) {
        parts.push(
          part(
            new BoxGeometry(0.08, wingY - 0.86, 0.2),
            x * W,
            (wingY + 0.8) / 2,
            -1.85 * L,
            def.accentColor,
          ),
        );
      }
    }
    const bodyMesh = new Mesh(merge(parts), paintMaterial);
    bodyMesh.castShadow = !ghost;
    this.body.add(bodyMesh);

    // Faros y pilotos: una malla para cada par (luz fija; los pilotos se avivan al frenar).
    const fronts: BufferGeometry[] = [];
    const backs: BufferGeometry[] = [];
    for (const x of [-0.62, 0.62]) {
      fronts.push(new BoxGeometry(0.42, 0.14, 0.05).translate(x * W, 0.66, 2.06 * L));
      backs.push(new BoxGeometry(0.42, 0.14, 0.05).translate(x * W, 0.68, -2.06 * L));
    }
    this.body.add(new Mesh(merge(fronts), headlight), new Mesh(merge(backs), this.taillight));

    // Haz de los faros sobre el asfalto (solo de noche y no en el fantasma).
    if (night && !ghost) {
      const beam = new Mesh(
        new PlaneGeometry(EFFECTS.beamWidth, EFFECTS.beamLength).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({
          map: beamTexture(),
          transparent: true,
          opacity: EFFECTS.beamOpacity,
          depthWrite: false,
          blending: AdditiveBlending,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      beam.position.set(0, 0.12, 2.1 * L + EFFECTS.beamLength / 2);
      beam.renderOrder = 2;
      this.body.add(beam);
      this.beam = beam;
    }

    // Ruedas: neumático y buje fusionados con colores por vértice. El giro (spin) va en un grupo propio y
    // las delanteras cuelgan de un pivote de dirección.
    const trackHalf = 0.82 * W;
    const wheelbaseHalf = 1.28 * L;
    for (const [x, z, front] of [
      [trackHalf, wheelbaseHalf, true],
      [-trackHalf, wheelbaseHalf, true],
      [trackHalf, -wheelbaseHalf, false],
      [-trackHalf, -wheelbaseHalf, false],
    ] as const) {
      const tire = part(
        new CylinderGeometry(0.36, 0.36, 0.3, 12).rotateZ(Math.PI / 2),
        0,
        0,
        0,
        TIRE_COLOR,
      );
      // CylinderGeometry y BoxGeometry tienen los mismos atributos, así que se pueden fusionar.
      const hub = part(new BoxGeometry(0.32, 0.12, 0.5), x > 0 ? 0.02 : -0.02, 0, 0, RIM_COLOR);
      const wheel = new Mesh(merge([tire, hub]), wheelMaterial);
      wheel.castShadow = !ghost;
      const pivot = new Group();
      pivot.position.set(x, 0.36, z);
      const spin = new Group();
      spin.add(wheel);
      pivot.add(spin);
      this.body.add(pivot);
      this.wheelSpins.push(spin);
      if (front) this.frontPivots.push(pivot);
    }
    this.group.add(this.body);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Intensidad de las luces de freno, 0 (apagadas) .. 1 (frenando). */
  setBrakeLight(level: number): void {
    const t = Math.max(0, Math.min(1, level));
    this.taillight.emissiveIntensity =
      EFFECTS.taillightIdle + (EFFECTS.taillightBrake - EFFECTS.taillightIdle) * t;
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

  /** true si lleva el haz de los faros (para tests y depuración). */
  get hasBeam(): boolean {
    return this.beam !== null;
  }
}
