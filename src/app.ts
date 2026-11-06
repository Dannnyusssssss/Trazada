import { createControls, InputState, type Action } from './core/input';
import { FixedStepAccumulator } from './core/loop';
import { lerp, lerpAngle } from './core/math';
import { parseDebugFlag } from './core/url';
import { RENDER, SIM, STEP_SECONDS } from './data/balance';
import { GORRION } from './data/cars';
import { TEXTS } from './data/texts';
import { VALLE_SOLAR } from './data/tracks';
import { Track } from './game/track';
import { World } from './game/world';
import { ChaseCamera } from './render/camera';
import { CarMesh } from './render/car-mesh';
import { Environment } from './render/environment';
import { Hud } from './render/hud';
import { GameRenderer } from './render/scene';
import { buildTrackMesh } from './render/track-mesh';
import { SaveStore, browserStorage, defaultSave, type Settings } from './save/storage';
import { DebugOverlay } from './ui/debug-overlay';
import { el, setVisible } from './ui/dom';
import { attachKeyboard } from './ui/keyboard';
import { MessageScreen } from './ui/message-screen';
import { PauseMenu } from './ui/pause-menu';
import { SettingsPanel } from './ui/settings-panel';
import { StartScreen } from './ui/start-screen';

type Screen = 'menu' | 'settings' | 'playing' | 'paused' | 'fatal';

/**
 * Orquesta el juego en el navegador: pantallas, bucle de frames, entrada, render y guardado.
 * La lógica avanza en pasos fijos dentro de `World`; aquí solo se decide cuándo avanzar y qué mostrar.
 */
export class App {
  private screen: Screen = 'menu';
  private settingsReturn: 'menu' | 'paused' = 'menu';
  private readonly input = new InputState();
  private readonly controls = createControls();
  private readonly accumulator = new FixedStepAccumulator(
    STEP_SECONDS,
    SIM.maxStepsPerFrame,
    SIM.maxFrameSeconds,
  );
  private readonly store: SaveStore;
  private readonly gameElement: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly message = new MessageScreen();
  private readonly track: Track;
  private readonly world: World;
  private renderer: GameRenderer | null = null;
  private chase: ChaseCamera | null = null;
  private carMesh: CarMesh | null = null;
  private environment: Environment | null = null;
  private hud: Hud | null = null;
  private startScreen: StartScreen | null = null;
  private pauseMenu: PauseMenu | null = null;
  private settingsPanel: SettingsPanel | null = null;
  private debug: DebugOverlay | null = null;
  private contextLost = false;
  private needsRender = true;
  private lastFrame = 0;
  private seenTeleports = -1;
  private seenLaps = 0;

  constructor(private readonly root: HTMLElement) {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.store = new SaveStore(browserStorage(), defaultSave(prefersReduced));
    this.track = new Track(VALLE_SOLAR);
    this.world = new World(this.track, GORRION, this.store.getBestLap(VALLE_SOLAR.id, GORRION.id));

    this.gameElement = el('div', {
      className: 'game',
      attrs: { tabindex: '0', 'aria-label': TEXTS.start.playHint },
    });
    this.overlay = el('div', { className: 'overlay' });
    this.root.append(this.gameElement, this.overlay);
    this.overlay.appendChild(this.message.root);
  }

  start(): void {
    const settings = this.store.data.settings;
    try {
      this.renderer = new GameRenderer(this.gameElement, RENDER.maxPixelRatio, settings.fov, {
        onContextLost: () => this.onContextLost(),
        onContextRestored: () => this.onContextRestored(),
        onResize: () => (this.needsRender = true),
      });
    } catch {
      this.screen = 'fatal';
      this.message.show(TEXTS.errors.webglTitle, TEXTS.errors.webgl);
      return;
    }

    const renderer = this.renderer;
    const anisotropy = Math.min(8, renderer.renderer.capabilities.getMaxAnisotropy());
    renderer.scene.add(buildTrackMesh(this.track, anisotropy));
    this.environment = new Environment(renderer.scene, this.track.def.palette);
    this.carMesh = new CarMesh(this.world.carDef);
    renderer.scene.add(this.carMesh.group);
    this.chase = new ChaseCamera(renderer.camera);

    this.hud = new Hud(() => this.toggleMute());
    this.gameElement.appendChild(this.hud.root);
    setVisible(this.hud.root, false);

    this.startScreen = new StartScreen(
      {
        onPlay: () => this.startRace(),
        onSettings: () => this.openSettings('menu'),
        onReducedMotion: (reducedMotion) => this.changeSettings({ reducedMotion }),
      },
      settings.reducedMotion,
    );
    this.pauseMenu = new PauseMenu({
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onSettings: () => this.openSettings('paused'),
      onMenu: () => this.toMenu(),
    });
    this.settingsPanel = new SettingsPanel(
      (patch) => this.changeSettings(patch),
      () => this.closeSettings(),
    );
    this.overlay.append(this.startScreen.root, this.pauseMenu.root, this.settingsPanel.root);
    this.pauseMenu.hide();
    this.settingsPanel.hide();

    if (parseDebugFlag(window.location.search)) {
      this.debug = new DebugOverlay(() => this.world);
      this.root.appendChild(this.debug.root);
    }

    attachKeyboard(this.input, {
      isDriving: () => this.screen === 'playing',
      onAction: (action, driving) => this.onAction(action, driving),
    });
    // Pausa automática al perder el foco o al ocultarse la pestaña.
    window.addEventListener('blur', () => this.pause(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.pause(true);
    });
    // Un clic en el área de juego le devuelve el foco del teclado.
    this.gameElement.addEventListener('pointerdown', () =>
      this.gameElement.focus({ preventScroll: true }),
    );

    this.applySettings();
    this.startScreen.show(settings.reducedMotion);
    requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const renderer = this.renderer;
    if (!renderer) return;
    const dt = this.lastFrame === 0 ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;

    if (this.screen === 'playing' && !this.contextLost) {
      const steps = this.accumulator.advance(dt);
      for (let i = 0; i < steps; i++) {
        this.input.toControls(this.controls);
        this.world.step({ controls: this.controls, respawn: this.input.consume('respawn') });
      }
      this.afterSteps();
      this.needsRender = true;
    }
    if (this.needsRender && !this.contextLost) this.draw(Math.min(dt, SIM.maxFrameSeconds));
    this.debug?.update(now, dt, renderer.drawCalls);
  };

  /** Reacciona a lo que pasó en los pasos de simulación: guarda récords. */
  private afterSteps(): void {
    const race = this.world.race;
    if (race.lapsCompleted > this.seenLaps) {
      this.seenLaps = race.lapsCompleted;
      if (race.lastLapMs !== null) {
        this.store.recordLap(this.track.def.id, this.world.carDef.id, race.lastLapMs);
      }
    }
  }

  private draw(dt: number): void {
    const renderer = this.renderer;
    const chase = this.chase;
    if (!renderer || !chase || !this.carMesh || !this.hud) return;
    const prev = this.world.previousCar;
    const car = this.world.car;
    const a = this.screen === 'playing' ? this.accumulator.alpha : 1;
    const x = lerp(prev.x, car.x, a);
    const z = lerp(prev.z, car.z, a);
    const heading = lerpAngle(prev.heading, car.heading, a);
    this.carMesh.update(
      x,
      z,
      heading,
      lerp(prev.steer, car.steer, a),
      lerpAngle(prev.wheelAngle, car.wheelAngle, a),
    );
    if (this.world.teleports !== this.seenTeleports) {
      // Tras reaparecer o reiniciar la cámara se coloca directamente (corte), sin barrido brusco.
      this.seenTeleports = this.world.teleports;
      chase.snap(x, z, heading);
    } else {
      chase.update(x, z, heading, dt, this.store.data.settings.reducedMotion);
    }
    const cam = renderer.camera.position;
    this.environment?.follow(cam.x, cam.y, cam.z);
    this.hud.update(this.world, car.forwardSpeed);
    renderer.render();
    this.needsRender = this.screen === 'playing';
  }

  private onAction(action: Action, driving: boolean): void {
    if (action === 'mute') {
      this.toggleMute();
      return;
    }
    if (action !== 'pause') return;
    if (driving) this.pause(false);
    else if (this.screen === 'paused') this.resume();
    else if (this.screen === 'settings') this.closeSettings();
  }

  private startRace(): void {
    this.world.reset();
    this.seenLaps = 0;
    this.hud?.reset();
    this.startScreen?.hide();
    if (this.hud) setVisible(this.hud.root, true);
    this.play();
  }

  private play(): void {
    this.screen = 'playing';
    this.input.clear();
    this.accumulator.reset();
    this.needsRender = true;
    this.gameElement.focus({ preventScroll: true });
  }

  private pause(focusLost: boolean): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.input.clear();
    this.needsRender = true;
    this.pauseMenu?.show(focusLost);
  }

  private resume(): void {
    if (this.screen !== 'paused' || this.contextLost) return;
    this.pauseMenu?.hide();
    this.play();
  }

  private restart(): void {
    this.pauseMenu?.hide();
    this.startRace();
  }

  private toMenu(): void {
    this.pauseMenu?.hide();
    this.world.reset();
    this.seenLaps = 0;
    this.hud?.reset();
    if (this.hud) setVisible(this.hud.root, false);
    this.screen = 'menu';
    this.needsRender = true;
    this.startScreen?.show(this.store.data.settings.reducedMotion);
  }

  private openSettings(from: 'menu' | 'paused'): void {
    this.settingsReturn = from;
    this.startScreen?.hide();
    this.pauseMenu?.hide();
    this.screen = 'settings';
    this.settingsPanel?.show(this.store.data.settings);
  }

  private closeSettings(): void {
    this.settingsPanel?.hide();
    this.screen = this.settingsReturn;
    if (this.settingsReturn === 'menu')
      this.startScreen?.show(this.store.data.settings.reducedMotion);
    else this.pauseMenu?.show(false);
  }

  private changeSettings(patch: Partial<Settings>): void {
    this.store.updateSettings(patch);
    this.applySettings();
  }

  private toggleMute(): void {
    this.changeSettings({ muted: !this.store.data.settings.muted });
  }

  private applySettings(): void {
    const settings = this.store.data.settings;
    this.renderer?.setFov(settings.fov);
    this.hud?.setMuted(settings.muted);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
    this.needsRender = true;
  }

  private onContextLost(): void {
    this.contextLost = true;
    this.pause(false);
    this.message.show(TEXTS.errors.contextLostTitle, TEXTS.errors.contextLost);
  }

  private onContextRestored(): void {
    this.contextLost = false;
    this.message.hide();
    this.needsRender = true;
  }
}
