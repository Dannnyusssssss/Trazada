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

  constructor(overlay: HTMLElement, actions: MenuActions, reducedMotion: boolean) {
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
  }

  hideAll(): void {
    this.start.hide();
    this.pause.hide();
    this.settings.hide();
    this.select.hide();
    this.results.hide();
  }
}
