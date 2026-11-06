import {
  ACESFilmicToneMapping,
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

/**
 * Renderer WebGL, escena y cámara. Ajusta el canvas al tamaño de su contenedor y respeta
 * `devicePixelRatio` con un tope. Si WebGL no está disponible, el constructor lanza un error.
 */
export class GameRenderer {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly resizeObserver: ResizeObserver;
  private dprQuery: MediaQueryList | null = null;
  private contextLost = false;

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
    this.watchPixelRatio();
    this.resize();
  }

  get isContextLost(): boolean {
    return this.contextLost;
  }

  setMaxPixelRatio(value: number): void {
    this.maxPixelRatio = value;
    this.resize();
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  resize(): void {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
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

  /** Llamadas de dibujo del último frame (para el panel de depuración). */
  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  /** Detecta cambios de devicePixelRatio (mover la ventana a otro monitor o hacer zoom). */
  private watchPixelRatio(): void {
    this.dprQuery?.removeEventListener('change', this.onPixelRatioChange);
    this.dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    this.dprQuery.addEventListener('change', this.onPixelRatioChange);
  }

  private readonly onPixelRatioChange = (): void => {
    this.resize();
    this.watchPixelRatio();
  };
}
