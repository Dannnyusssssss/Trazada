import {
  BackSide,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Scene,
} from 'three';
import type { TrackPalette } from '../data/tracks';

const SKY_RADIUS = 1400;

/**
 * Cielo en degradado (cúpula con colores por vértice, sin texturas), luz del sol, luz ambiente
 * de hemisferio y niebla, según la paleta del circuito.
 */
export class Environment {
  readonly group = new Group();
  private readonly sky: Mesh;
  private readonly sun: DirectionalLight;
  private readonly sunOffset: [number, number, number];

  constructor(
    private readonly scene: Scene,
    palette: TrackPalette,
    /** Sombras del sol (solo en calidad Alta): tamaño del mapa en px; 0 = sin sombras. */
    shadowMapSize: number,
    shadowArea: number,
  ) {
    const geometry = new SphereGeometry(SKY_RADIUS, 32, 16);
    const top = new Color(palette.skyTop);
    const horizon = new Color(palette.skyHorizon);
    const bottom = new Color(palette.skyBottom);
    const position = geometry.getAttribute('position');
    const colors: number[] = [];
    const c = new Color();
    for (let i = 0; i < position.count; i++) {
      const h = position.getY(i) / SKY_RADIUS;
      if (h >= 0) c.copy(horizon).lerp(top, Math.pow(h, 0.6));
      else c.copy(horizon).lerp(bottom, Math.min(1, -h * 4));
      colors.push(c.r, c.g, c.b);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.sky = new Mesh(
      geometry,
      new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }),
    );
    this.sky.name = 'sky';
    this.sky.renderOrder = -2;
    this.group.add(this.sky);

    const hemi = new HemisphereLight(palette.hemiSky, palette.hemiGround, palette.hemiIntensity);
    this.group.add(hemi);
    const sun = new DirectionalLight(palette.sunColor, palette.sunIntensity);
    const [dx, dy, dz] = palette.sunDirection;
    const len = Math.hypot(dx, dy, dz) || 1;
    this.sunOffset = [(dx / len) * 120, (dy / len) * 120, (dz / len) * 120];
    sun.position.set(...this.sunOffset);
    if (shadowMapSize > 0) {
      // Una sola luz con sombras, con un mapa que sigue al coche.
      sun.castShadow = true;
      sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      const half = shadowArea / 2;
      sun.shadow.camera.left = -half;
      sun.shadow.camera.right = half;
      sun.shadow.camera.top = half;
      sun.shadow.camera.bottom = -half;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 300;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.04;
      this.group.add(sun.target);
    }
    this.sun = sun;
    this.group.add(sun);

    scene.fog = new Fog(palette.fog, palette.fogNear, palette.fogFar);
    scene.background = new Color(palette.skyHorizon);
    scene.add(this.group);
  }

  /** La cúpula sigue a la cámara para que el horizonte no se acerque nunca. */
  follow(x: number, y: number, z: number): void {
    this.sky.position.set(x, y, z);
  }

  /** Mueve la luz del sol (y su mapa de sombras) para que acompañe al coche. */
  followTarget(x: number, y: number, z: number): void {
    if (!this.sun.castShadow) return;
    this.sun.target.position.set(x, y, z);
    this.sun.position.set(x + this.sunOffset[0], y + this.sunOffset[1], z + this.sunOffset[2]);
  }

  detach(): void {
    this.scene.remove(this.group);
    this.scene.fog = null;
    this.scene.background = null;
  }
}
