import { FrameStats, type FrameStatsSnapshot } from '../core/frame-stats';
import type { Quality } from '../data/balance';
import { TEXTS } from '../data/texts';
import type { RenderStats } from '../render/scene';
import { el, setText } from './dom';

/** Cada cuánto se refresca el texto (ms). */
const REFRESH_MS = 250;

/** Abrevia triángulos: 950, 145k, 1.2M. */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/**
 * Panel de métricas de rendimiento para cualquier jugador. Oculto no calcula nada; sin `aria-live`
 * para que los lectores de pantalla no lo anuncien cada refresco.
 */
export class MetricsOverlay {
  readonly root: HTMLElement;
  private readonly text: HTMLElement;
  private readonly stats = new FrameStats();
  private readonly snapshot: FrameStatsSnapshot = { fps: 0, meanMs: 0, p95Ms: 0 };
  private lastRefresh = 0;
  private shown = false;

  constructor() {
    this.text = el('pre', { className: 'metrics-text' });
    this.root = el(
      'aside',
      { className: 'metrics-overlay', attrs: { 'aria-label': TEXTS.metrics.label } },
      [this.text],
    );
    this.root.hidden = true;
  }

  get visible(): boolean {
    return this.shown;
  }

  setVisible(visible: boolean): void {
    if (visible === this.shown) return;
    this.shown = visible;
    this.root.hidden = !visible;
    if (visible) {
      this.stats.reset();
      this.lastRefresh = 0;
    }
  }

  update(
    now: number,
    frameSeconds: number,
    render: RenderStats,
    renderScale: number,
    quality: Quality,
  ): void {
    if (!this.shown) return;
    this.stats.push(frameSeconds);
    if (now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const s = this.stats.sample(this.snapshot);
    const t = TEXTS.metrics;
    setText(
      this.text,
      [
        `${t.fps} ${s.fps.toFixed(0)}`,
        `${t.frame} ${s.meanMs.toFixed(1)} ${t.ms} · ${t.p95} ${s.p95Ms.toFixed(1)} ${t.ms}`,
        `${t.calls} ${render.calls} · ${t.triangles} ${formatCount(render.triangles)}`,
        `${t.resolution} ×${renderScale.toFixed(2)} · ${t.quality} ${TEXTS.settings.qualityOptions[quality]}`,
      ].join('\n'),
    );
  }
}
