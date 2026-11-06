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

// Alturas de las capas sobre la superficie de la pista. Junto con el orden de dibujo y el desplazamiento de
// polígonos del terreno evitan que las capas se mezclen a distancia (z-fighting).
const RUNOFF_LIFT = 0.02;
const ASPHALT_LIFT = 0.05;
const CURB_LIFT = 0.08;
const START_LINE_LIFT = 0.1;
const BARRIER_HEIGHT = 0.9;
/** Las vallas se hunden en el terreno para que no quede un hueco por debajo. */
const BARRIER_BURY = 0.6;

interface RibbonBuffers {
  positions: number[];
  uvs: number[];
  indices: number[];
}

function emptyBuffers(): RibbonBuffers {
  return { positions: [], uvs: [], indices: [] };
}

function toGeometry(b: RibbonBuffers): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(b.positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(b.uvs, 2));
  g.setIndex(b.indices);
  g.computeVertexNormals();
  return g;
}

/** Longitud de repetición ajustada para que la textura cierre sin costura en la meta. */
function fittedTile(length: number, tile: number): number {
  return length / Math.max(1, Math.round(length / tile));
}

/**
 * Cinta que sigue la superficie (altura y peralte) entre dos distancias laterales, desde la muestra
 * `from` hasta `to` (incluida). `uScale` repite la textura a lo ancho (0 = una sola vez de 0 a 1).
 */
function addSurfaceStrip(
  b: RibbonBuffers,
  track: Track,
  from: number,
  to: number,
  latLeft: number,
  latRight: number,
  lift: number,
  tile: number,
  uScale = 0,
): void {
  const base = b.positions.length / 3;
  const n = track.sampleCount;
  const u0 = uScale > 0 ? latLeft / uScale : 0;
  const u1 = uScale > 0 ? latRight / uScale : 1;
  for (let k = from; k <= to; k++) {
    const i = k % n;
    const x = track.x(i);
    const z = track.z(i);
    const tx = track.tx[i] ?? 1;
    const tz = track.tz[i] ?? 0;
    // Normal izquierda (tz, -tx).
    b.positions.push(
      x + tz * latLeft,
      track.heightAt(i, latLeft) + lift,
      z - tx * latLeft,
      x + tz * latRight,
      track.heightAt(i, latRight) + lift,
      z - tx * latRight,
    );
    const v = (k * track.spacing) / tile;
    b.uvs.push(u0, v, u1, v);
  }
  for (let k = 0; k < to - from; k++) {
    const a = base + k * 2;
    // Orden de vértices con la normal hacia arriba (+Y).
    b.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/** Valla vertical a una distancia lateral fija, a lo largo de toda la vuelta, siguiendo la altura. */
function addWall(b: RibbonBuffers, track: Track, lateral: number, tile: number): void {
  const base = b.positions.length / 3;
  const n = track.sampleCount;
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const tx = track.tx[i] ?? 1;
    const tz = track.tz[i] ?? 0;
    const x = track.x(i) + tz * lateral;
    const z = track.z(i) - tx * lateral;
    const y = track.heightAt(i, lateral);
    b.positions.push(x, y - BARRIER_BURY, z, x, y + BARRIER_HEIGHT, z);
    const u = (k * track.spacing) / tile;
    // La franja inferior de la textura queda enterrada.
    b.uvs.push(u, -BARRIER_BURY / BARRIER_HEIGHT, u, 1);
  }
  for (let k = 0; k < n; k++) {
    const a = base + k * 2;
    b.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
}

/**
 * Malla procedural del circuito: asfalto con marcas, franja de césped hasta el muro, pianos en las curvas,
 * vallas y línea de meta. Una malla por material, para mantener bajas las llamadas de dibujo.
 */
export function buildTrackMesh(track: Track, anisotropy: number): Group {
  const def = track.def;
  const palette = def.palette;
  const rng = new Rng(def.seed);
  const group = new Group();
  group.name = 'track';
  const hw = track.halfWidth;
  const n = track.sampleCount;
  const wall = track.wallDistance;

  // Franja de césped entre el asfalto y el muro (sigue la superficie exacta de la pista).
  const runoff = emptyBuffers();
  const grassTile = GRASS_TILE_METERS;
  addSurfaceStrip(runoff, track, 0, n, wall + 0.6, hw - 0.05, RUNOFF_LIFT, grassTile, grassTile);
  addSurfaceStrip(runoff, track, 0, n, -hw + 0.05, -wall - 0.6, RUNOFF_LIFT, grassTile, grassTile);
  const runoffMesh = new Mesh(
    toGeometry(runoff),
    new MeshLambertMaterial({ map: createGrassTexture(palette, rng, anisotropy) }),
  );
  runoffMesh.name = 'runoff';
  runoffMesh.receiveShadow = true;
  group.add(runoffMesh);

  // Asfalto: una sola cinta cerrada.
  const asphalt = emptyBuffers();
  addSurfaceStrip(
    asphalt,
    track,
    0,
    n,
    hw,
    -hw,
    ASPHALT_LIFT,
    fittedTile(track.length, ASPHALT_TILE_METERS),
  );
  const asphaltMesh = new Mesh(
    toGeometry(asphalt),
    new MeshLambertMaterial({ map: createAsphaltTexture(palette, rng, def.width, anisotropy) }),
  );
  asphaltMesh.name = 'asphalt';
  asphaltMesh.receiveShadow = true;
  group.add(asphaltMesh);

  // Pianos: tramos continuos de muestras marcadas, en los dos bordes.
  const curbs = emptyBuffers();
  const curbOuter = 0.35;
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
        const tile = CURB_TILE_METERS;
        addSurfaceStrip(
          curbs,
          track,
          start,
          end,
          hw + curbOuter,
          hw - TRACK.curbWidth,
          CURB_LIFT,
          tile,
        );
        addSurfaceStrip(
          curbs,
          track,
          start,
          end,
          -hw + TRACK.curbWidth,
          -hw - curbOuter,
          CURB_LIFT,
          tile,
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
    curbMesh.receiveShadow = true;
    group.add(curbMesh);
  }

  // Vallas a la distancia del muro, a ambos lados.
  const walls = emptyBuffers();
  const barrierTile = fittedTile(track.length, BARRIER_TILE_METERS);
  addWall(walls, track, wall, barrierTile);
  addWall(walls, track, -wall, barrierTile);
  const wallMesh = new Mesh(
    toGeometry(walls),
    new MeshLambertMaterial({ map: createBarrierTexture(palette, anisotropy), side: DoubleSide }),
  );
  wallMesh.name = 'barriers';
  group.add(wallMesh);

  // Línea de meta y pórtico.
  const heading = Math.atan2(-(track.tz[0] ?? 0), track.tx[0] ?? 1);
  const startGroup = new Group();
  startGroup.position.set(track.x(0), track.py[0] ?? 0, track.z(0));
  startGroup.rotation.y = heading + Math.PI / 2;
  const checker = createCheckerTexture();
  const checkerMaterial = new MeshLambertMaterial({ map: checker });
  const line = new Mesh(new PlaneGeometry(def.width, 1.6), checkerMaterial);
  line.rotation.x = -Math.PI / 2;
  line.position.y = START_LINE_LIFT;
  startGroup.add(line);
  const postMaterial = new MeshLambertMaterial({ color: 0xe8e4da });
  const postGeometry = new BoxGeometry(0.5, 6.6, 0.5);
  for (const side of [-1, 1]) {
    const post = new Mesh(postGeometry, postMaterial);
    post.position.set(side * (hw + 1.2), 2.7, 0);
    post.castShadow = true;
    startGroup.add(post);
  }
  const banner = new Mesh(new BoxGeometry(def.width + 2.9, 1.2, 0.4), checkerMaterial);
  banner.position.set(0, 6, 0);
  banner.castShadow = true;
  startGroup.add(banner);
  group.add(startGroup);

  return group;
}
