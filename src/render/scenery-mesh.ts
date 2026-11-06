import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';
import type { TrackPalette } from '../data/tracks';
import type { SceneryItem, SceneryItemKind } from '../game/scenery';
import { cssColor } from './textures';

/** Una pieza de un tipo de objeto: geometría, material y cómo se colorea cada instancia. */
interface Part {
  geometry: BufferGeometry;
  material: Material;
  /** Colores posibles por instancia (null = sin color por instancia). */
  colors: readonly number[] | null;
  castShadow: boolean;
}

function merged(parts: BufferGeometry[]): BufferGeometry {
  const geometry = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  parts.forEach((g) => g.dispose());
  if (!geometry) throw new Error('No se pudo unir la geometría');
  return geometry;
}

/** Ventanas de los edificios: una textura de color (fachada) y otra de luz (ventanas encendidas). */
function windowTextures(palette: TrackPalette, rng: Rng): [CanvasTexture, CanvasTexture] {
  const make = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    return [canvas, ctx];
  };
  const [colorCanvas, color] = make();
  const [lightCanvas, light] = make();
  color.fillStyle = '#ffffff';
  color.fillRect(0, 0, 128, 256);
  light.fillStyle = '#000000';
  light.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 12; r++) {
    for (let c = 0; c < 5; c++) {
      const x = 8 + c * 24;
      const y = 8 + r * 20;
      color.fillStyle = '#5d6470';
      color.fillRect(x, y, 14, 11);
      // Solo algunas ventanas encendidas, con luz fija (sin parpadeos).
      if (rng.next() < 0.45) {
        const lights = palette.lights;
        light.fillStyle = cssColor(lights[rng.int(0, lights.length - 1)] ?? 0xffffff);
        light.fillRect(x, y, 14, 11);
      }
    }
  }
  const colorTexture = new CanvasTexture(colorCanvas);
  colorTexture.colorSpace = SRGBColorSpace;
  const lightTexture = new CanvasTexture(lightCanvas);
  lightTexture.colorSpace = SRGBColorSpace;
  return [colorTexture, lightTexture];
}

function partsFor(kind: SceneryItemKind, palette: TrackPalette, rng: Rng): Part[] {
  const trunk = (): Part => ({
    geometry: new CylinderGeometry(0.2, 0.28, 1.8, 6).translate(0, 0.9, 0),
    material: new MeshLambertMaterial({ color: 0x6b4a32 }),
    colors: null,
    castShadow: true,
  });
  switch (kind) {
    case 'pine':
      return [
        trunk(),
        {
          geometry: merged([
            new ConeGeometry(1.7, 3.2, 7).translate(0, 3.0, 0),
            new ConeGeometry(1.25, 2.6, 7).translate(0, 4.7, 0),
          ]),
          material: new MeshLambertMaterial({ flatShading: true }),
          colors: palette.foliage,
          castShadow: true,
        },
      ];
    case 'broadleaf':
      return [
        trunk(),
        {
          geometry: new IcosahedronGeometry(2.2, 0).translate(0, 3.4, 0),
          material: new MeshLambertMaterial({ flatShading: true }),
          colors: palette.foliage,
          castShadow: true,
        },
      ];
    case 'rock':
      return [
        {
          geometry: new IcosahedronGeometry(1.3, 0).scale(1, 0.65, 1).translate(0, 0.35, 0),
          material: new MeshLambertMaterial({ color: palette.rock, flatShading: true }),
          colors: null,
          castShadow: true,
        },
      ];
    case 'building': {
      const [map, emissiveMap] = windowTextures(palette, rng);
      return [
        {
          // Caja de lado 1 apoyada en el suelo; cada instancia la escala a su tamaño.
          geometry: new BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
          material: new MeshLambertMaterial({
            map,
            emissive: 0xffffff,
            emissiveMap,
            emissiveIntensity: 0.85,
          }),
          colors: palette.facades,
          castShadow: true,
        },
      ];
    }
    case 'lamp':
      return [
        {
          geometry: merged([
            new CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0),
            new BoxGeometry(0.14, 0.14, 2.2).translate(0, 6.9, 1.0),
          ]),
          material: new MeshLambertMaterial({ color: 0x8a8fa0 }),
          colors: null,
          castShadow: false,
        },
        {
          // Foco con luz fija: material sin iluminación para que se vea encendido.
          geometry: new BoxGeometry(0.5, 0.18, 0.8).translate(0, 6.78, 2.0),
          material: new MeshBasicMaterial(),
          colors: palette.lights,
          castShadow: false,
        },
      ];
  }
}

/** Escala de cada instancia según el tipo (los edificios se estiran a lo alto). */
function instanceScale(item: SceneryItem, rng: Rng, out: Vector3): Vector3 {
  if (item.kind === 'building') {
    const footprint = 11 * item.scale;
    return out.set(footprint, rng.range(12, 46) * item.scale, footprint * rng.range(0.8, 1.2));
  }
  if (item.kind === 'rock')
    return out.set(item.scale * rng.range(0.8, 1.3), item.scale, item.scale);
  return out.setScalar(item.scale);
}

/**
 * Escenario con InstancedMesh: una malla instanciada por pieza y tipo, con muy pocas llamadas de dibujo.
 * `density` (0..1) reduce la cantidad en calidad Baja quedándose con una parte fija de los objetos.
 */
export function buildSceneryMesh(
  items: readonly SceneryItem[],
  palette: TrackPalette,
  seed: number,
  density: number,
  shadows: boolean,
): Group {
  const group = new Group();
  group.name = 'scenery';
  const rng = new Rng(seed ^ 0x2545f491);
  const step = density >= 1 ? 1 : Math.max(1, Math.round(1 / Math.max(density, 0.05)));
  const byKind = new Map<SceneryItemKind, SceneryItem[]>();
  for (const item of items) {
    const list = byKind.get(item.kind) ?? [];
    list.push(item);
    byKind.set(item.kind, list);
  }
  const matrix = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const euler = new Euler();
  const scale = new Vector3();
  const color = new Color();

  for (const [kind, all] of byKind) {
    // Las farolas no se reducen: marcan el borde de la pista de noche.
    const list = kind === 'lamp' ? all : all.filter((_, k) => k % step === 0);
    if (list.length === 0) continue;
    const parts = partsFor(kind, palette, rng);
    const meshes = parts.map((part) => {
      const mesh = new InstancedMesh(part.geometry, part.material, list.length);
      mesh.name = `scenery-${kind}`;
      mesh.castShadow = shadows && part.castShadow;
      mesh.receiveShadow = false;
      return mesh;
    });
    list.forEach((item, index) => {
      position.set(item.x, item.y, item.z);
      quaternion.setFromEuler(euler.set(0, item.rotation, 0));
      instanceScale(item, rng, scale);
      matrix.compose(position, quaternion, scale);
      parts.forEach((part, p) => {
        const mesh = meshes[p];
        if (!mesh) return;
        mesh.setMatrixAt(index, matrix);
        if (part.colors && part.colors.length > 0) {
          color.setHex(part.colors[item.variant % part.colors.length] ?? 0xffffff);
          mesh.setColorAt(index, color);
        }
      });
    });
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
  }
  return group;
}
