import { mirrorLayout } from '../core/touch';
import type { TouchButton, TouchSize, TouchState } from '../core/touch';
import { TEXTS } from '../data/texts';
import { el, setVisible } from './dom';

/**
 * Adaptador DOM de los controles táctiles: dibuja los botones, escucha los eventos de puntero sobre la capa
 * y se los pasa a `TouchState`. No tiene método por frame: todo ocurre por evento.
 */

export interface TouchLayoutOptions {
  leftHanded: boolean;
  size: TouchSize;
  opacity: number;
}

/** Lista blanca de valores válidos para `data-touch`. */
const BUTTONS: readonly TouchButton[] = [
  'respawn',
  'camera',
  'pause',
  'left',
  'right',
  'handbrake',
  'brake',
  'throttle',
];

const TOP: readonly TouchButton[] = ['respawn', 'camera', 'pause'];
const STEER: readonly TouchButton[] = ['left', 'right'];
const PEDALS: readonly TouchButton[] = ['handbrake', 'brake', 'throttle'];

function asButton(value: string | undefined): TouchButton | null {
  if (value === undefined) return null;
  return (BUTTONS as readonly string[]).includes(value) ? (value as TouchButton) : null;
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.4, value));
}

export class TouchControls {
  private layer: HTMLElement | null = null;
  private readonly nodes = new Map<TouchButton, HTMLElement>();
  /** Punteros capturados por la capa (solo los que empezaron sobre un botón válido). */
  private readonly captured = new Set<number>();
  private visible = false;
  private options: TouchLayoutOptions = { leftHanded: false, size: 'medium', opacity: 1 };

  constructor(
    private readonly parent: HTMLElement,
    private readonly state: TouchState,
  ) {}

  static prefersTouch(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }

  get enabled(): boolean {
    return this.layer !== null;
  }

  enable(): void {
    if (this.layer) return;
    const layer = el('div', {
      className: 'touch-layer',
      attrs: { role: 'group', 'aria-label': TEXTS.touch.groupLabel },
    });
    layer.hidden = !this.visible;
    layer.appendChild(this.group('touch-top', TOP));
    layer.appendChild(this.group('touch-steer', STEER));
    layer.appendChild(this.group('touch-pedals', PEDALS));
    this.layer = layer;
    this.parent.appendChild(layer);
    this.applyLayout(this.options);

    layer.addEventListener('pointerdown', this.onDown);
    layer.addEventListener('pointermove', this.onMove);
    layer.addEventListener('pointerup', this.onUp);
    layer.addEventListener('pointercancel', this.onCancel);
    layer.addEventListener('lostpointercapture', this.onCancel);
    layer.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    if (!this.layer) return;
    setVisible(this.layer, visible);
    if (!visible) this.releaseAll();
  }

  applyLayout(opts: TouchLayoutOptions): void {
    this.options = {
      leftHanded: opts.leftHanded,
      size: opts.size,
      opacity: clampOpacity(opts.opacity),
    };
    if (!this.layer) return;
    const layout = mirrorLayout(this.options.leftHanded);
    this.layer.dataset.steer = layout.steer;
    this.layer.dataset.pedals = layout.pedals;
    this.layer.dataset.size = this.options.size;
    this.layer.style.setProperty('--touch-opacity', String(this.options.opacity));
  }

  releaseAll(): void {
    this.state.releaseAll();
    this.captured.clear();
    this.refresh();
  }

  private group(className: string, names: readonly TouchButton[]): HTMLElement {
    const group = el('div', { className });
    for (const name of names) {
      const info = TEXTS.touch[name];
      const icon = el('span', {
        className: 'touch-icon',
        text: info.icon,
        attrs: { 'aria-hidden': 'true' },
      });
      const btn = el(
        'button',
        {
          className: `touch-btn touch-btn--${name}`,
          attrs: { type: 'button', 'data-touch': name, 'aria-label': info.label },
        },
        [icon],
      );
      this.nodes.set(name, btn);
      group.appendChild(btn);
    }
    return group;
  }

  /** Botón de la capa bajo un elemento (o null si no hay o no es válido). */
  private buttonFrom(target: Element | null): TouchButton | null {
    const node = target?.closest<HTMLElement>('[data-touch]') ?? null;
    if (!node || !this.layer || !this.layer.contains(node)) return null;
    return asButton(node.dataset.touch);
  }

  /** Sincroniza la clase `is-held` de los botones con el estado. */
  private refresh(): void {
    for (const [name, node] of this.nodes)
      node.classList.toggle('is-held', this.state.isHeld(name));
  }

  private readonly onDown = (e: PointerEvent): void => {
    const button = this.buttonFrom(e.target instanceof Element ? e.target : null);
    if (button === null) return;
    this.state.down(e.pointerId, e.pointerType, button);
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      e.preventDefault();
      try {
        // Se captura en el botón: los eventos siguientes le llegan aunque el dedo salga de él y suben
        // hasta la capa, que tiene pointer-events: none.
        this.nodes.get(button)?.setPointerCapture(e.pointerId);
        this.captured.add(e.pointerId);
      } catch {
        // El puntero ya no existe: se ignora.
      }
    }
    this.refresh();
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.captured.has(e.pointerId)) return;
    const button = this.buttonFrom(document.elementFromPoint(e.clientX, e.clientY));
    this.state.move(e.pointerId, button);
    this.refresh();
  };

  private readonly onUp = (e: PointerEvent): void => {
    this.captured.delete(e.pointerId);
    this.state.up(e.pointerId);
    this.refresh();
  };

  private readonly onCancel = (e: PointerEvent): void => {
    this.captured.delete(e.pointerId);
    this.state.cancel(e.pointerId);
    this.refresh();
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.releaseAll();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.releaseAll();
  };
}
