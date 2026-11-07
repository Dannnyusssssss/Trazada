import { CAR_PARAM_KEYS } from '../data/cars';
import { TEXTS } from '../data/texts';
import type { World } from '../game/world';
import type { RenderStats } from '../render/scene';
import { button, el, setText } from './dom';

/** Cada cuánto se refresca el texto del panel (ms): no hace falta hacerlo en cada frame. */
const REFRESH_MS = 250;
/** Frames recientes que se guardan para el tiempo de frame medio y el percentil 95. */
const FRAME_HISTORY = 240;

/**
 * Panel de depuración (solo con ?debug): FPS, llamadas de dibujo, estado del coche y de la pista, y los
 * parámetros de física editables en vivo para afinar el manejo. No existe si el parámetro no está activo.
 */
export class DebugOverlay {
  readonly root: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly dump: HTMLElement;
  private readonly inputs = new Map<string, HTMLInputElement>();
  private lastRefresh = 0;
  private frames = 0;
  private frameTime = 0;
  /** Historial circular de duraciones de frame (ms) y copia para ordenarlo sin crear arreglos. */
  private readonly history = new Float32Array(FRAME_HISTORY);
  private readonly sorted = new Float32Array(FRAME_HISTORY);
  private historyCount = 0;
  private historyIndex = 0;

  constructor(private readonly getWorld: () => World) {
    this.stats = el('pre', { className: 'debug-stats' });
    this.dump = el('pre', { className: 'debug-dump' });
    const rows = CAR_PARAM_KEYS.map((key) => {
      const input = el('input', { attrs: { type: 'number', step: 'any', 'aria-label': key } });
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (Number.isFinite(value) && value >= 0) this.getWorld().params[key] = value;
        else input.value = String(this.getWorld().params[key]);
      });
      this.inputs.set(key, input);
      return el('label', { className: 'debug-param' }, [el('span', { text: key }), input]);
    });
    this.root = el('aside', { className: 'debug-overlay' }, [
      el('strong', { text: TEXTS.debug.title }),
      this.stats,
      el('details', {}, [
        el('summary', { text: TEXTS.debug.physics }),
        ...rows,
        el('div', { className: 'actions' }, [
          button(TEXTS.debug.reset, () => this.resetParams(), 'btn btn-small'),
          button(TEXTS.debug.show, () => this.showParams(), 'btn btn-small'),
        ]),
        this.dump,
      ]),
    ]);
    this.syncInputs();
  }

  /** Vuelve a leer los parámetros (tras reiniciar el mundo, por ejemplo). */
  syncInputs(): void {
    const params = this.getWorld().params;
    for (const key of CAR_PARAM_KEYS) {
      const input = this.inputs.get(key);
      if (input) input.value = String(params[key]);
    }
  }

  update(now: number, frameSeconds: number, render: RenderStats, renderScale: number): void {
    this.frames++;
    this.frameTime += frameSeconds;
    if (frameSeconds > 0) {
      this.history[this.historyIndex] = frameSeconds * 1000;
      this.historyIndex = (this.historyIndex + 1) % FRAME_HISTORY;
      this.historyCount = Math.min(this.historyCount + 1, FRAME_HISTORY);
    }
    if (now - this.lastRefresh < REFRESH_MS) return;
    const { mean, p95 } = this.frameStats();
    const fps = this.frameTime > 0 ? this.frames / this.frameTime : 0;
    this.frames = 0;
    this.frameTime = 0;
    this.lastRefresh = now;
    const world = this.getWorld();
    const car = world.car;
    const q = world.query;
    setText(
      this.stats,
      [
        `FPS        ${fps.toFixed(0)}`,
        `frame      ${mean.toFixed(1)} ms (p95 ${p95.toFixed(1)} ms)`,
        `draw calls ${render.calls}`,
        `triángulos ${render.triangles}`,
        `resolución ×${renderScale.toFixed(2)} (pixel ratio ${render.pixelRatio.toFixed(2)})`,
        `memoria    ${render.geometries} geometrías, ${render.textures} texturas`,
        `velocidad  ${(car.forwardSpeed * 3.6).toFixed(1)} km/h`,
        `derrape    ${car.lateralSpeed.toFixed(2)} m/s`,
        `superficie ${TEXTS.surfaces[car.surface]}`,
        `progreso   ${q.progress.toFixed(1)} / ${world.track.length.toFixed(0)} m`,
        `lateral    ${q.lateral.toFixed(2)} m`,
        `checkpoint ${world.race.nextCheckpoint} (último ${world.race.lastCheckpoint})`,
      ].join('\n'),
    );
  }

  /** Tiempo de frame medio y percentil 95 de los últimos frames (ms). */
  private frameStats(): { mean: number; p95: number } {
    const n = this.historyCount;
    if (n === 0) return { mean: 0, p95: 0 };
    const view = this.sorted.subarray(0, n);
    view.set(this.history.subarray(0, n));
    view.sort();
    let sum = 0;
    for (let i = 0; i < n; i++) sum += view[i] ?? 0;
    return { mean: sum / n, p95: view[Math.min(n - 1, Math.floor(n * 0.95))] ?? 0 };
  }

  private resetParams(): void {
    const world = this.getWorld();
    Object.assign(world.params, world.carDef.params);
    this.syncInputs();
  }

  private showParams(): void {
    setText(this.dump, JSON.stringify(this.getWorld().params, null, 2));
  }
}
