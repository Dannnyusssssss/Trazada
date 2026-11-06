import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/rng';
import { TRACK } from '../data/balance';
import type { Track } from '../game/track';
import {
  ASPHALT_TILE_METERS,
  BARRIER_TILE_METERS,
  CURB_TILE_METERS,
  GRASS_TILE_METERS,
  createAsphaltTexture,
  createBarrierTexture,
  createCheckerTexture,
  createCurbTexture,
  createGrassTexture,
} from './textures';

// Alturas de las capas planas sobre el césped. Junto con el orden de dibujo y el desplazamiento de
// polígonos del césped evitan que las capas se mezclen a distancia (z-fighting).
const ASPHALT_Y = 0.04;
const CURB_Y = 0.07;
const START_LINE_Y = 0.09;
const BARRIER_HEIGHT = 0.9;

interface RibbonBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

function emptyBuffers(): RibbonBuffers {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function toGeometry(b: RibbonBuffers): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(b.normals, 3));
  g.setAttribute('uv', new Float32BufferAttribute(b.uvs, 2));
  g.setIndex(b.indices);
  return g;
}

/** Longitud de repetición ajustada para que la textura cierre sin costura en la meta. */
function fittedTile(length: number, tile: number): number {
  return length / Math.max(1, Math.round(length / tile));
}

/** Cinta horizontal entre dos distancias laterales, desde la muestra `from` hasta `to` (incluida). */
function addFlatStrip(
  b: RibbonBuffers,
  track: Track,
  from: number,
  to: number,
  latLeft: number,
  latRight: number,
  y: number,
  tile: number,
): void {
  const base = b.positions.length / 3;
  const n = track.sampleCount;
  for (let k = from; k <= to; k++) {
    const i = k % n;
    const x = track.x(i);
    const z = track.z(i);
    const tx = track.tx[i] ?? 1;
    const tz = track.tz[i] ?? 0;
    // Normal izquierda (tz, -tx).
    b.positions.push(
      x + tz * latLeft,
      y,
      z - tx * latLeft,
      x + tz * latRight,
      y,
      z - tx * latRight,
    );
    b.normals.push(0, 1, 0, 0, 1, 0);
    const v = (k * track.spacing) / tile;
    b.uvs.push(0, v, 1, v);
  }
  for (let k = 0; k < to - from; k++) {
    const a = base + k * 2;
    // Orden de vértices con la normal hacia arriba (+Y).
    b.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/** Pared vertical a una distancia lateral fija, a lo largo de toda la vuelta. */
function addWall(
  b: RibbonBuffers,
  track: Track,
  lateral: number,
  height: number,
  tile: number,
): void {
  const base = b.positions.length / 3;
  const n = track.sampleCount;
  const inward = lateral > 0 ? -1 : 1;
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const tx = track.tx[i] ?? 1;
    const tz = track.tz[i] ?? 0;
    const x = track.x(i) + tz * lateral;
    const z = track.z(i) - tx * lateral;
    b.positions.push(x, 0, z, x, height, z);
    const nx = tz * inward;
    const nz = -tx * inward;
    b.normals.push(nx, 0, nz, nx, 0, nz);
    const u = (k * track.spacing) / tile;
    b.uvs.push(u, 0, u, 1);
  }
  for (let k = 0; k < n; k++) {
    const a = base + k * 2;
    b.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

/**
 * Malla procedural del circuito: césped, asfalto con marcas, pianos en las curvas, vallas y línea de meta.
 * Se agrupa en pocos objetos (una malla por material) para mantener bajas las llamadas de dibujo.
 */
export function buildTrackMesh(track: Track, anisotropy: number): Group {
  const def = track.def;
  const palette = def.palette;
  const rng = new Rng(def.seed);
  const group = new Group();
  group.name = 'track';
  const hw = track.halfWidth;

  // Césped: un plano grande bajo todo el circuito.
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
  const margin = 700;
  const groundW = maxX - minX + margin * 2;
  const groundD = maxZ - minZ + margin * 2;
  const grassTexture = createGrassTexture(palette, rng, anisotropy);
  grassTexture.repeat.set(groundW / GRASS_TILE_METERS, groundD / GRASS_TILE_METERS);
  const ground = new Mesh(
    new PlaneGeometry(groundW, groundD),
    new MeshLambertMaterial({
      map: grassTexture,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  ground.name = 'ground';
  // El césped se dibuja antes que el resto de la pista.
  ground.renderOrder = -1;
  group.add(ground);

  // Asfalto: una sola cinta cerrada.
  const asphalt = emptyBuffers();
  addFlatStrip(
    asphalt,
    track,
    0,
    track.sampleCount,
    hw,
    -hw,
    ASPHALT_Y,
    fittedTile(track.length, ASPHALT_TILE_METERS),
  );
  const asphaltMesh = new Mesh(
    toGeometry(asphalt),
    new MeshLambertMaterial({ map: createAsphaltTexture(palette, rng, def.width, anisotropy) }),
  );
  asphaltMesh.name = 'asphalt';
  group.add(asphaltMesh);

  // Pianos: tramos continuos de muestras marcadas, en los dos bordes.
  const curbs = emptyBuffers();
  const n = track.sampleCount;
  const curbOuter = 0.35;
  const curbTile = CURB_TILE_METERS;
  let start = -1;
  // Se empieza en una muestra sin piano para no partir un tramo que cruce la meta.
  const firstFree = track.curbed.indexOf(0);
  if (firstFree >= 0) {
    for (let k = 0; k <= n; k++) {
      const i = (firstFree + k) % n;
      const on = track.curbed[i] === 1 && k < n;
      if (on && start < 0) start = firstFree + k;
      if (!on && start >= 0) {
        const end = firstFree + k;
        addFlatStrip(
          curbs,
          track,
          start,
          end,
          hw + curbOuter,
          hw - TRACK.curbWidth,
          CURB_Y,
          curbTile,
        );
        addFlatStrip(
          curbs,
          track,
          start,
          end,
          -hw + TRACK.curbWidth,
          -hw - curbOuter,
          CURB_Y,
          curbTile,
        );
        start = -1;
      }
    }
  }
  if (curbs.indices.length > 0) {
    const curbMesh = new Mesh(
      toGeometry(curbs),
      new MeshLambertMaterial({ map: createCurbTexture(palette, anisotropy) }),
    );
    curbMesh.name = 'curbs';
    group.add(curbMesh);
  }

  // Vallas a la distancia del muro, a ambos lados.
  const walls = emptyBuffers();
  const barrierTile = fittedTile(track.length, BARRIER_TILE_METERS);
  addWall(walls, track, track.wallDistance, BARRIER_HEIGHT, barrierTile);
  addWall(walls, track, -track.wallDistance, BARRIER_HEIGHT, barrierTile);
  const wallMesh = new Mesh(
    toGeometry(walls),
    new MeshLambertMaterial({ map: createBarrierTexture(palette, anisotropy), side: DoubleSide }),
  );
  wallMesh.name = 'barriers';
  group.add(wallMesh);

  // Línea de meta y pórtico.
  const heading = Math.atan2(-(track.tz[0] ?? 0), track.tx[0] ?? 1);
  const startGroup = new Group();
  startGroup.position.set(track.x(0), 0, track.z(0));
  startGroup.rotation.y = heading + Math.PI / 2;
  const checker = createCheckerTexture();
  const line = new Mesh(
    new PlaneGeometry(def.width, 1.6),
    new MeshLambertMaterial({ map: checker }),
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = START_LINE_Y;
  startGroup.add(line);
  const postMaterial = new MeshLambertMaterial({ color: 0xe8e4da });
  const postGeometry = new BoxGeometry(0.5, 6, 0.5);
  for (const side of [-1, 1]) {
    const post = new Mesh(postGeometry, postMaterial);
    post.position.set(side * (hw + 1.2), 3, 0);
    startGroup.add(post);
  }
  const banner = new Mesh(
    new BoxGeometry(def.width + 2.9, 1.2, 0.4),
    new MeshLambertMaterial({ map: checker }),
  );
  banner.position.set(0, 6, 0);
  startGroup.add(banner);
  group.add(startGroup);

  return group;
}
