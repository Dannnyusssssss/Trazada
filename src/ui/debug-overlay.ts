import { FrameStats, type FrameStatsSnapshot } from '../core/frame-stats';
import { CAR_PARAM_KEYS } from '../data/cars';
import { TEXTS } from '../data/texts';
import type { World } from '../game/world';
import type { RenderStats } from '../render/scene';
import { button, el, setText } from './dom';

/** Cada cuánto se refresca el texto del panel (ms): no hace falta hacerlo en cada frame. */
const REFRESH_MS = 250;

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
  private readonly frameStats = new FrameStats();
  private readonly snapshot: FrameStatsSnapshot = { fps: 0, meanMs: 0, p95Ms: 0 };

  constructor(private readonly getWorld: () => World) {
    this.stats = el('pre', { className: 'debug-stats' });
    this.dump = el('pre', { className: 'debug-dump' });
    const rows = CAR_PARAM_KEYS.map((key) => {
      const input = el('input', { attrs: { type: 'number', step: 'any', 'aria-label': key } });
      input.addEventListener('change', () => {
        // El mundo recorta el valor a su rango y marca la sesión: no se guardarán sus resultados.
        input.value = String(this.getWorld().setParam(key, Number(input.value)));
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
    this.frameStats.push(frameSeconds);
    if (now - this.lastRefresh < REFRESH_MS) return;
    const { fps, meanMs: mean, p95Ms: p95 } = this.frameStats.sample(this.snapshot);
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

  private resetParams(): void {
    this.getWorld().resetParams();
    this.syncInputs();
  }

  private showParams(): void {
    setText(this.dump, JSON.stringify(this.getWorld().params, null, 2));
  }
}
