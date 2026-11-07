import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  WebGLRenderer,
} from 'three';

export interface RendererCallbacks {
  onContextLost: () => void;
  onContextRestored: () => void;
  /** El tamaño o la densidad de píxeles cambió: hay que volver a dibujar. */
  onResize: () => void;
}

/** Datos del render para el panel de depuración. */
export interface RenderStats {
  calls: number;
  triangles: number;
  /** Pixel ratio efectivo (calidad × escala dinámica). */
  pixelRatio: number;
  geometries: number;
  textures: number;
}

/**
 * Renderer WebGL, escena y cámara. Ajusta el canvas al tamaño de su contenedor y respeta
 * `devicePixelRatio` con un tope. Si WebGL no está disponible, el constructor lanza un error.
 */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly resizeObserver: ResizeObserver;
  /** devicePixelRatio con el que se ajustó el canvas la última vez. */
  private lastDevicePixelRatio = 0;
  private contextLost = false;
  /** Escala de la resolución interna (resolución dinámica); 1 = la del ajuste de calidad. */
  private renderScale = 1;

  constructor(
    private readonly container: HTMLElement,
    private maxPixelRatio: number,
    fov: number,
    private readonly callbacks: RendererCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    this.camera = new PerspectiveCamera(fov, 1, 0.3, 1600);

    canvas.addEventListener('webglcontextlost', (event) => {
      // preventDefault permite que el navegador restaure el contexto más tarde.
      event.preventDefault();
      this.contextLost = true;
      callbacks.onContextLost();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.resize();
      callbacks.onContextRestored();
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  setMaxPixelRatio(value: number): void {
    this.maxPixelRatio = value;
    this.resize();
  }

  /** Cambia la escala de la resolución interna (el canvas sigue ocupando el mismo espacio). */
  setRenderScale(scale: number): void {
    if (!Number.isFinite(scale) || scale <= 0 || scale === this.renderScale) return;
    this.renderScale = Math.min(scale, 1);
    this.resize();
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.lastDevicePixelRatio = window.devicePixelRatio || 1;
    const dpr = Math.min(this.lastDevicePixelRatio, this.maxPixelRatio) * this.renderScale;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.callbacks.onResize();
  }

  render(): void {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  /** Llamadas de dibujo del último frame y recursos en memoria de la GPU (para el panel de depuración). */
  get stats(): RenderStats {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      pixelRatio: this.renderer.getPixelRatio(),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  /** Activa o desactiva las sombras (solo calidad Alta). */
  setShadows(enabled: boolean): void {
    this.renderer.shadowMap.enabled = enabled;
    this.renderer.shadowMap.type = PCFShadowMap;
  }

  /**
   * Reajusta el canvas si cambió el devicePixelRatio (mover la ventana a otro monitor o hacer zoom). Se llama
   * en cada frame: es una comparación de números, y no todos los navegadores avisan del cambio con un evento.
   */
  checkPixelRatio(): void {
    if ((window.devicePixelRatio || 1) !== this.lastDevicePixelRatio) this.resize();
  }
}
