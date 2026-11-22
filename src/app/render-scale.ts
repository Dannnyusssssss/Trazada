import { DynamicResolution } from '../core/dynamic-resolution';
import { DYNAMIC_RESOLUTION } from '../data/balance';
import type { GameRenderer } from '../render/scene';
import type { SaveStore, Settings } from '../save/storage';

/** Escala de resolución que se aplica: la guardada si la resolución dinámica está activa, si no 1. */
export function effectiveRenderScale(settings: Settings): number {
  return settings.dynamicResolution ? settings.renderScale : 1;
}

/** Resolución dinámica: baja la resolución interna si los FPS caen de forma sostenida y lo guarda. */
export class RenderScale {
  /** Decide cuándo bajar la resolución interna si los FPS caen de forma sostenida. */
  private readonly dynamic: DynamicResolution;

  constructor(initialScale: number) {
    this.dynamic = new DynamicResolution(DYNAMIC_RESOLUTION, initialScale);
  }

  /** La medición de FPS empieza de cero: el tiempo en menús o en pausa no cuenta. */
  restart(): void {
    this.dynamic.restart();
  }

  setScale(scale: number): void {
    this.dynamic.setScale(scale);
  }

  /** Mide el frame y, si los FPS llevan un rato bajos, baja la resolución interna y lo guarda. */
  update(dt: number, store: SaveStore, renderer: GameRenderer | null): void {
    if (!store.data.settings.dynamicResolution) return;
    if (!this.dynamic.update(dt)) return;
    store.updateSettings({ renderScale: this.dynamic.scale });
    renderer?.setRenderScale(effectiveRenderScale(store.data.settings));
  }
}
