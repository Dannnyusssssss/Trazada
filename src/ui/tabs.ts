/**
 * Pestañas accesibles (patrón WAI-ARIA Tabs, activación automática).
 */
import { cycleIndex, edgeIndex } from '../core/cycle';
import { button, el } from './dom';

export interface TabSpec {
  id: string;
  label: string;
  panel: HTMLElement;
  className?: string;
}

export class Tabs {
  readonly root: HTMLElement;
  private readonly list: HTMLElement;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly specs: readonly TabSpec[];
  private index = 0;

  constructor(
    idPrefix: string,
    ariaLabel: string,
    tabs: readonly TabSpec[],
    private readonly onChange?: (id: string) => void,
  ) {
    this.specs = tabs;
    this.list = el('div', {
      className: 'tabs-list',
      attrs: { role: 'tablist', 'aria-label': ariaLabel },
    });
    this.root = el('div', { className: 'tabs' }, [this.list]);

    tabs.forEach((spec, i) => {
      const tabId = `${idPrefix}-tab-${spec.id}`;
      const panelId = `${idPrefix}-panel-${spec.id}`;
      const btn = button(
        spec.label,
        () => this.selectIndex(i, false),
        spec.className ? `tab ${spec.className}` : 'tab',
      );
      btn.setAttribute('role', 'tab');
      btn.id = tabId;
      btn.setAttribute('aria-controls', panelId);
      this.buttons.push(btn);
      this.list.appendChild(btn);

      spec.panel.setAttribute('role', 'tabpanel');
      spec.panel.id = panelId;
      spec.panel.setAttribute('aria-labelledby', tabId);
      spec.panel.classList.add('tab-panel');
      this.root.appendChild(spec.panel);
    });

    this.list.addEventListener('keydown', (event) => this.onKeyDown(event));
    this.apply();
  }

  get selected(): string {
    return this.specs[this.index]?.id ?? '';
  }

  select(id: string, focus = false): void {
    const i = this.specs.findIndex((spec) => spec.id === id);
    if (i >= 0) this.selectIndex(i, focus);
  }

  step(delta: 1 | -1, focus = false): void {
    const next = cycleIndex(this.index, delta, this.specs.length, (i) => this.isVisible(i));
    this.selectIndex(next, focus);
  }

  /** Si la pestaña elegida no se ve (el CSS la oculta), elige la primera visible. */
  ensureVisibleSelection(): void {
    if (this.isVisible(this.index)) return;
    const first = edgeIndex(false, this.specs.length, (i) => this.isVisible(i));
    if (first >= 0) this.selectIndex(first, false);
  }

  private isVisible(i: number): boolean {
    const btn = this.buttons[i];
    return btn !== undefined && btn.getClientRects().length > 0;
  }

  private selectIndex(i: number, focus: boolean): void {
    if (i < 0 || i >= this.specs.length) return;
    const changed = i !== this.index;
    this.index = i;
    this.apply();
    if (focus) this.buttons[i]?.focus();
    const spec = this.specs[i];
    if (changed && spec) this.onChange?.(spec.id);
  }

  private apply(): void {
    this.specs.forEach((spec, i) => {
      const active = i === this.index;
      const btn = this.buttons[i];
      if (!btn) return;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
      spec.panel.hidden = !active;
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !this.buttons.includes(target as HTMLButtonElement))
      return;
    const visible = (i: number): boolean => this.isVisible(i);
    let next: number;
    switch (event.key) {
      case 'ArrowLeft':
        next = cycleIndex(this.index, -1, this.specs.length, visible);
        break;
      case 'ArrowRight':
        next = cycleIndex(this.index, 1, this.specs.length, visible);
        break;
      case 'Home':
        next = edgeIndex(false, this.specs.length, visible);
        break;
      case 'End':
        next = edgeIndex(true, this.specs.length, visible);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (next >= 0) this.selectIndex(next, true);
  }
}
