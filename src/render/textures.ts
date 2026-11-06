import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Rng } from '../core/rng';
import type { TrackPalette } from '../data/tracks';

/** Longitud de pista (m) que cubre una repetición de la textura del asfalto. */
export const ASPHALT_TILE_METERS = 12;
/** Longitud (m) de una repetición del piano: una franja de cada color. */
export const CURB_TILE_METERS = 2;
/** Longitud (m) de una repetición de la valla. */
export const BARRIER_TILE_METERS = 4;
/** Lado (m) de una repetición de la textura del césped. */
export const GRASS_TILE_METERS = 10;

export function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible');
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

/** Puntos de grano para dar textura sin patrones visibles. */
function speckle(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  width: number,
  height: number,
  color: string,
  count: number,
  maxSize: number,
): void {
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const s = rng.range(1, maxSize);
    ctx.fillRect(rng.range(0, width), rng.range(0, height), s, s);
  }
}

/**
 * Asfalto: el eje u cruza la pista (0 = borde izquierdo, 1 = borde derecho) y el eje v avanza por ella.
 * Lleva líneas blancas en los bordes y una línea central discontinua.
 */
export function createAsphaltTexture(
  palette: TrackPalette,
  rng: Rng,
  trackWidth: number,
  anisotropy: number,
): CanvasTexture {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.fillStyle = cssColor(palette.asphalt);
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, rng, w, h, cssColor(palette.asphaltDetail), 2600, 2.5);
  speckle(ctx, rng, w, h, 'rgba(0,0,0,0.12)', 1400, 2);

  const pxPerMeterU = w / trackWidth;
  const pxPerMeterV = h / ASPHALT_TILE_METERS;
  const line = cssColor(palette.line);
  ctx.fillStyle = line;
  // Líneas de borde: 0.25 m de ancho, a 0.5 m del borde (dejan sitio al piano por fuera).
  const edgeInset = 0.5 * pxPerMeterU;
  const edgeWidth = Math.max(3, 0.25 * pxPerMeterU);
  ctx.fillRect(edgeInset, 0, edgeWidth, h);
  ctx.fillRect(w - edgeInset - edgeWidth, 0, edgeWidth, h);
  // Línea central discontinua: tramos de 3 m con huecos de 3 m.
  const centerWidth = Math.max(3, 0.18 * pxPerMeterU);
  for (let m = 0; m < ASPHALT_TILE_METERS; m += 6) {
    ctx.fillRect(w / 2 - centerWidth / 2, m * pxPerMeterV, centerWidth, 3 * pxPerMeterV);
  }
  return toTexture(canvas, anisotropy);
}

export function createCurbTexture(palette: TrackPalette, anisotropy: number): CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 128);
  ctx.fillStyle = cssColor(palette.curbA);
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = cssColor(palette.curbB);
  ctx.fillRect(0, 64, 32, 64);
  return toTexture(canvas, anisotropy);
}

/** Valla: u avanza por la pista, v sube. Paneles de dos colores con una franja superior. */
export function createBarrierTexture(palette: TrackPalette, anisotropy: number): CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 32);
  ctx.fillStyle = cssColor(palette.barrierA);
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = cssColor(palette.barrierB);
  ctx.fillRect(64, 0, 64, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, 128, 3);
  ctx.fillRect(0, 29, 128, 3);
  return toTexture(canvas, anisotropy);
}

export function createGrassTexture(
  palette: TrackPalette,
  rng: Rng,
  anisotropy: number,
): CanvasTexture {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  ctx.fillStyle = cssColor(palette.ground);
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, rng, size, size, cssColor(palette.groundDetail), 3000, 3);
  speckle(ctx, rng, size, size, 'rgba(255,255,255,0.05)', 900, 2);
  return toTexture(canvas, anisotropy);
}

/** Cuadros de la línea de meta: 2 filas a lo largo, 8 columnas a lo ancho. */
export function createCheckerTexture(): CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 32);
  for (let c = 0; c < 8; c++) {
    for (let r = 0; r < 2; r++) {
      ctx.fillStyle = (c + r) % 2 === 0 ? '#f4f1e8' : '#1d1f26';
      ctx.fillRect(c * 16, r * 16, 16, 16);
    }
  }
  const texture = toTexture(canvas, 1);
  return texture;
}
