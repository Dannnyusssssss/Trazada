import type { Settings } from '../save/storage';
import { PauseMenu } from '../ui/pause-menu';
import { ResultsScreen } from '../ui/results-screen';
import { SelectScreen, type Selection } from '../ui/select-screen';
import { SettingsPanel } from '../ui/settings-panel';
import { StartScreen } from '../ui/start-screen';

/** Lo que pueden pedir los menús a la aplicación. */
export interface MenuActions {
  openSelect(): void;
  openSettings(from: 'menu' | 'paused'): void;
  closeSettings(): void;
  changeSettings(patch: Partial<Settings>): void;
  resume(): void;
  startRace(): void;
  onSelect(selection: Selection): void;
  nextTrack(): void;
  toMenu(): void;
}

/** Las pantallas de menú (inicio, pausa, ajustes, selección y resultados), montadas sobre el juego. */
export class Menus {
  readonly start: StartScreen;
  readonly pause: PauseMenu;
  readonly settings: SettingsPanel;
  readonly select: SelectScreen;
  readonly results: ResultsScreen;

  private readonly screens: readonly { root: HTMLElement }[];

  constructor(
    overlay: HTMLElement,
    actions: MenuActions,
    reducedMotion: boolean,
    defaults: () => Settings,
  ) {
    this.start = new StartScreen(
      {
        onPlay: () => actions.openSelect(),
        onSettings: () => actions.openSettings('menu'),
        onReducedMotion: (value) => actions.changeSettings({ reducedMotion: value }),
      },
      reducedMotion,
    );
    this.pause = new PauseMenu({
      onResume: () => actions.resume(),
      onRestart: () => actions.startRace(),
      onSelect: () => actions.openSelect(),
      onSettings: () => actions.openSettings('paused'),
      onMenu: () => actions.toMenu(),
    });
    this.settings = new SettingsPanel(
      (patch) => actions.changeSettings(patch),
      () => actions.closeSettings(),
      defaults,
    );
    this.select = new SelectScreen(
      (selection) => actions.onSelect(selection),
      () => actions.toMenu(),
    );
    this.results = new ResultsScreen({
      onRetry: () => actions.startRace(),
      onNext: () => actions.nextTrack(),
      onSelect: () => actions.openSelect(),
      onMenu: () => actions.toMenu(),
    });
    overlay.append(
      this.start.root,
      this.pause.root,
      this.settings.root,
      this.select.root,
      this.results.root,
    );
    this.pause.hide();
    this.settings.hide();
    this.screens = [this.start, this.pause, this.settings, this.select, this.results];
  }

  /** La pantalla de menú visible (para navegar con el mando), o null si no hay ninguna. */
  visibleRoot(): HTMLElement | null {
    for (const screen of this.screens) if (!screen.root.hidden) return screen.root;
    return null;
  }

  hideAll(): void {
    this.start.hide();
    this.pause.hide();
    this.settings.hide();
    this.select.hide();
    this.results.hide();
  }
}
