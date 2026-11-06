import { HUD } from '../data/balance';
import type { Track } from '../game/track';

const PADDING = 10;

/**
 * Minimapa 2D en un <canvas> pequeño. El trazado se dibuja una sola vez en un canvas aparte; en cada frame
 * solo se copia y se pintan los puntos del coche y del fantasma. Vista cenital con el norte fijo
 * (x hacia la derecha, z hacia abajo), así que un giro a la izquierda se ve en sentido antihorario.
 */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly background: HTMLCanvasElement;
  private scale = 1;
  private offsetX = 0;
  private offsetZ = 0;
  private pixelRatio = 1;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.background = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
  }

  /** Prepara el minimapa de un circuito (dibuja el trazado en el canvas de fondo). */
  setTrack(track: Track): void {
    const size = HUD.minimapSize;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(size * this.pixelRatio);
    for (const c of [this.canvas, this.background]) {
      c.width = px;
      c.height = px;
    }
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
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
    const span = Math.max(maxX - minX, maxZ - minZ, 1);
    this.scale = (size - 2 * PADDING) / span;
    this.offsetX =
      PADDING + (size - 2 * PADDING - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.offsetZ =
      PADDING + (size - 2 * PADDING - (maxZ - minZ) * this.scale) / 2 - minZ * this.scale;

    const ctx = this.background.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(12, 16, 28, 0.72)';
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, 10);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const path = new Path2D();
    for (let i = 0; i <= track.sampleCount; i += 4) {
      const k = i % track.sampleCount;
      const x = this.mapX(track.x(k));
      const y = this.mapZ(track.z(k));
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    ctx.strokeStyle = '#11141c';
    ctx.lineWidth = 7;
    ctx.stroke(path);
    ctx.strokeStyle = '#d6d9e2';
    ctx.lineWidth = 3.5;
    ctx.stroke(path);
    // Línea de meta: una marca a lo ancho de la pista.
    const nx = track.tz[0] ?? 0;
    const nz = -(track.tx[0] ?? 1);
    const sx = this.mapX(track.x(0));
    const sy = this.mapZ(track.z(0));
    ctx.strokeStyle = '#ffb547';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx - nx * 6, sy - nz * 6);
    ctx.lineTo(sx + nx * 6, sy + nz * 6);
    ctx.stroke();
  }

  private mapX(x: number): number {
    return x * this.scale + this.offsetX;
  }

  private mapZ(z: number): number {
    return z * this.scale + this.offsetZ;
  }

  private dot(x: number, z: number, radius: number, fill: string, stroke: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(this.mapX(x), this.mapZ(z), radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }

  /** Dibuja el frame: el fantasma (si hay) debajo y el coche encima. */
  draw(carX: number, carZ: number, ghostX: number | null, ghostZ: number | null): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.background, 0, 0);
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    if (ghostX !== null && ghostZ !== null)
      this.dot(ghostX, ghostZ, 4, 'rgba(240,244,255,0.75)', '#11141c');
    this.dot(carX, carZ, 5, '#ffb547', '#11141c');
  }
}
