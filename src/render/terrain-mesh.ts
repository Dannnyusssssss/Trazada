import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/rng';
import { TERRAIN } from '../data/balance';
import { baseTerrainHeight, terrainHeight } from '../game/terrain';
import type { Track } from '../game/track';
import { GRASS_TILE_METERS, createGrassTexture } from './textures';

/** Lado del plano lejano que rodea al terreno detallado (m). */
const FAR_PLANE_SIZE = 4000;

/**
 * Terreno alrededor del circuito: una rejilla que sigue la altura de la pista cerca de ella y se aplana
 * lejos, más un plano grande hasta el horizonte. Se dibuja antes que la pista y con desplazamiento de
 * polígonos para que nunca la tape.
 */
export function buildTerrainMesh(track: Track, anisotropy: number): Group {
  const group = new Group();
  group.name = 'terrain';
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.sampleCount; i++) {
    minX = Math.min(minX, track.x(i));
    maxX = Math.max(maxX, track.x(i));
    minZ = Math.min(minZ, track.z(i));
    maxZ = Math.max(maxZ, track.z(i));
  }
  const m = TERRAIN.margin;
  const cell = TERRAIN.cellSize;
  const cols = Math.ceil((maxX - minX + 2 * m) / cell);
  const rows = Math.ceil((maxZ - minZ + 2 * m) / cell);
  const x0 = minX - m;
  const z0 = minZ - m;

  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const uvs = new Float32Array((cols + 1) * (rows + 1) * 2);
  let p = 0;
  let u = 0;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = x0 + c * cell;
      const z = z0 + r * cell;
      positions[p++] = x;
      positions[p++] = terrainHeight(track, x, z);
      positions[p++] = z;
      uvs[u++] = x / GRASS_TILE_METERS;
      uvs[u++] = z / GRASS_TILE_METERS;
    }
  }
  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      // Orden con la normal hacia arriba (+Y).
      indices.push(a, d, b, b, d, e);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const texture = createGrassTexture(track.def.palette, new Rng(track.def.seed + 7), anisotropy);
  const material = new MeshLambertMaterial({
    map: texture,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });
  const terrain = new Mesh(geometry, material);
  terrain.name = 'terrain-near';
  terrain.renderOrder = -1;
  terrain.receiveShadow = true;
  group.add(terrain);

  // Plano lejano, un poco más bajo para no solaparse con el borde del terreno detallado.
  const farTexture = texture.clone();
  farTexture.repeat.set(FAR_PLANE_SIZE / GRASS_TILE_METERS, FAR_PLANE_SIZE / GRASS_TILE_METERS);
  const far = new Mesh(
    new PlaneGeometry(FAR_PLANE_SIZE, FAR_PLANE_SIZE),
    new MeshLambertMaterial({
      map: farTexture,
      polygonOffset: true,
      polygonOffsetFactor: 4,
      polygonOffsetUnits: 4,
    }),
  );
  far.rotation.x = -Math.PI / 2;
  far.position.set((minX + maxX) / 2, baseTerrainHeight(track) - 0.3, (minZ + maxZ) / 2);
  far.name = 'terrain-far';
  far.renderOrder = -1;
  group.add(far);
  return group;
}
