import { SoundEngine } from './audio/web/sound-engine';
import type { Action } from './core/input';
import { FixedStepAccumulator } from './core/loop';
import { parseDebugFlag } from './core/url';
import { QUALITY, SIM, STEP_SECONDS } from './data/balance';
import { carById, type CarDef } from './data/cars';
import { TEXTS } from './data/texts';
import { TRACKS, type TrackDef } from './data/tracks';
import { isTrackUnlocked } from './game/progress';
import type { World } from './game/world';
import { ChaseCamera } from './render/camera';
import { Hud } from './render/hud';
import { GameRenderer } from './render/scene';
import { GhostStore } from './save/ghost-storage';
import { SaveStore, browserStorage, defaultSave, type Settings } from './save/storage';
import { DebugOverlay } from './ui/debug-overlay';
import { el, setVisible } from './ui/dom';
import { MessageScreen } from './ui/message-screen';
import type { Selection } from './ui/select-screen';
import { attachBrowserEvents } from './app/browser-events';
import { GameInput } from './app/game-input';
import { Menus } from './app/menus';
import { RaceAudio } from './app/race-audio';
import { RaceView } from './app/race-view';
import { effectiveRenderScale, RenderScale } from './app/render-scale';
import { SessionRecorder } from './app/session-recorder';
import { WorldFactory } from './app/world-factory';

type Screen = 'menu' | 'select' | 'settings' | 'playing' | 'paused' | 'results' | 'fatal';

/**
 * Orquesta el juego en el navegador: pantallas, bucle de frames, entrada (teclado y mando), render,
 * efectos, sonido y guardado. La lógica avanza en pasos fijos dentro de `World`; aquí solo se decide cuándo
 * avanzar y qué mostrar.
 */
export class App {
  private screen: Screen = 'menu';
  private settingsReturn: 'menu' | 'paused' = 'menu';
  /** Teclado y mando combinados. */
  private readonly input = new GameInput();
  private readonly accumulator = new FixedStepAccumulator(
    STEP_SECONDS,
    SIM.maxStepsPerFrame,
    SIM.maxFrameSeconds,
  );
  private readonly store: SaveStore;
  /** Resolución dinámica (baja la resolución interna si los FPS caen de forma sostenida). */
  private readonly renderScale: RenderScale;
  private readonly gameElement: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly message = new MessageScreen();
  private readonly worlds: WorldFactory;
  private world: World;
  private renderer: GameRenderer | null = null;
  private chase: ChaseCamera | null = null;
  private hud: Hud | null = null;
  private menus: Menus | null = null;
  private debug: DebugOverlay | null = null;
  /** Lo visual de la carrera (escena, coches, efectos, cámara y HUD de cada frame). */
  private readonly view = new RaceView();
  private readonly sound = new SoundEngine();
  /** Mezcla de sonido de la carrera. */
  private readonly audio = new RaceAudio(this.sound);
  private contextLost = false;
  private needsRender = true;
  private lastFrame = 0;
  /** Récords, fantasma y resultados de la sesión. */
  private readonly recorder: SessionRecorder;
  /** Reacción a las teclas y botones de un disparo (un solo objeto, sin crear funciones por frame). */
  private readonly handleAction = (action: Action, driving: boolean): void =>
    this.onAction(action, driving);

  constructor(private readonly root: HTMLElement) {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const storage = browserStorage();
    this.store = new SaveStore(storage, defaultSave(prefersReduced));
    this.recorder = new SessionRecorder(this.store, new GhostStore(storage), this.view);
    this.worlds = new WorldFactory(this.store);
    const first = this.worlds.initialSelection();
    const settings = this.store.data.settings;
    this.renderScale = new RenderScale(settings.renderScale);
    this.world = this.createWorld(first.track, first.car, settings.mode, settings.difficulty);

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
    const quality = QUALITY[settings.quality];
    try {
      this.renderer = new GameRenderer(this.gameElement, quality.maxPixelRatio, settings.fov, {
        onContextLost: () => this.onContextLost(),
        onContextRestored: () => this.onContextRestored(),
        onResize: () => (this.needsRender = true),
      });
    } catch {
      this.screen = 'fatal';
      this.message.show(TEXTS.errors.webglTitle, TEXTS.errors.webgl);
      return;
    }
    this.chase = new ChaseCamera(this.renderer.camera);
    this.chase.setMode(settings.camera, true);

    this.hud = new Hud(() => this.toggleMute());
    this.view.attach(this.renderer, this.chase, this.hud);
    this.gameElement.appendChild(this.hud.root);
    setVisible(this.hud.root, false);

    this.menus = new Menus(
      this.overlay,
      {
        openSelect: () => this.openSelect(),
        openSettings: (from) => this.openSettings(from),
        closeSettings: () => this.closeSettings(),
        changeSettings: (patch) => this.changeSettings(patch),
        resume: () => this.resume(),
        startRace: () => this.startRace(),
        onSelect: (selection) => this.onSelect(selection),
        nextTrack: () => this.nextTrack(),
        toMenu: () => this.toMenu(),
      },
      settings.reducedMotion,
    );

    if (parseDebugFlag(window.location.search)) {
      this.debug = new DebugOverlay(() => this.world);
      this.root.appendChild(this.debug.root);
    }

    attachBrowserEvents(this.gameElement, this.input.keyboard, {
      isDriving: () => this.screen === 'playing',
      onAction: this.handleAction,
      unlockAudio: () => this.sound.unlock(),
      onFocusLost: () => this.pause(true),
    });

    this.ensureScene(true);
    this.applySettings();
    this.menus.start.show(settings.reducedMotion);
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------------------------------------
  // Circuito, coches y fantasma

  /** Crea el mundo de una sesión y prepara el estado por coche del render y del sonido. */
  private createWorld(
    trackDef: TrackDef,
    carDef: CarDef,
    mode: World['mode'],
    difficulty: World['difficulty'],
  ): World {
    const world = this.worlds.create(trackDef, carDef, mode, difficulty);
    this.view.resetRacers(world);
    this.audio.resetRacers(world);
    return world;
  }

  /** Construye lo visual del circuito actual si cambió el circuito o la calidad (o si `force`). */
  private ensureScene(force = false): void {
    const quality = this.store.data.settings.quality;
    if (!this.view.ensureScene(this.world, quality, force)) return;
    this.recorder.loadGhost(this.world);
    this.view.snapCamera();
    this.needsRender = true;
  }

  private select(selection: Selection, trackDef: TrackDef, carDef: CarDef): void {
    this.world = this.createWorld(trackDef, carDef, selection.mode, selection.difficulty);
    this.store.updateSettings({
      lastTrackId: trackDef.id,
      lastCarId: carDef.id,
      mode: selection.mode,
      difficulty: selection.difficulty,
    });
    this.ensureScene();
    this.debug?.syncInputs();
  }

  // ---------------------------------------------------------------------------------------------
  // Bucle de frames

  private readonly frame = (now: number): void => {
    try {
      this.runFrame(now);
    } catch (error) {
      // Un error inesperado no deja la imagen congelada sin explicación: se detiene el bucle y se avisa.
      this.fail(error);
      return;
    }
    requestAnimationFrame(this.frame);
  };

  /** Detiene el juego y muestra un mensaje claro. El error queda en la consola para poder diagnosticarlo. */
  fail(error: unknown): void {
    console.error(error);
    if (this.screen === 'fatal') return;
    this.screen = 'fatal';
    this.menus?.hideAll();
    if (this.hud) setVisible(this.hud.root, false);
    this.sound.setPaused(true);
    this.message.show(TEXTS.errors.unexpectedTitle, TEXTS.errors.unexpected);
  }

  private runFrame(now: number): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const dt = this.lastFrame === 0 ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    renderer.checkPixelRatio();
    this.input.pollGamepad(this.screen === 'playing', this.handleAction);

    if (this.screen === 'playing' && !this.contextLost) {
      const steps = this.accumulator.advance(dt);
      this.view.effects.clearImpacts();
      for (let i = 0; i < steps; i++) {
        const respawn = this.input.readStep();
        this.world.step({ controls: this.input.controls, respawn });
        // Golpes de cada coche en estos pasos (para chispas, sacudida y sonido).
        this.view.effects.recordImpacts(this.world.racers);
      }
      if (this.recorder.afterSteps(this.world)) this.showResults();
      this.needsRender = true;
      this.renderScale.update(dt, this.store, this.renderer);
    }
    const frameDt = Math.min(dt, SIM.maxFrameSeconds);
    if (this.needsRender && !this.contextLost) this.draw(frameDt);
    this.audio.update(
      this.world,
      frameDt,
      this.screen === 'playing',
      this.screen === 'results',
      this.view.effects.playerImpact,
    );
    this.debug?.update(now, dt, renderer.stats, effectiveRenderScale(this.store.data.settings));
  }

  /** Dibuja el frame; mientras se conduce se interpola entre pasos y se sigue dibujando cada frame. */
  private draw(dt: number): void {
    const settings = this.store.data.settings;
    const playing = this.screen === 'playing';
    const alpha = playing ? this.accumulator.alpha : 1;
    if (this.view.draw(this.world, dt, alpha, playing, settings.reducedMotion, settings.fov)) {
      this.needsRender = playing;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Pantallas

  private onAction(action: Action, driving: boolean): void {
    if (action === 'mute') {
      this.toggleMute();
      return;
    }
    if (action === 'camera') {
      const camera = this.store.data.settings.camera === 'chase' ? 'high' : 'chase';
      this.changeSettings({ camera });
      return;
    }
    if (action !== 'pause') return;
    if (driving) this.pause(false);
    else if (this.screen === 'paused') this.resume();
    else if (this.screen === 'settings') this.closeSettings();
    else if (this.screen === 'select') this.toMenu();
  }

  /** El audio suena mientras se conduce y en los resultados; en los menús se suspende. */
  private updateAudioState(): void {
    this.sound.setPaused(this.screen !== 'playing' && this.screen !== 'results');
  }

  private openSelect(): void {
    this.menus?.hideAll();
    this.screen = 'select';
    this.updateAudioState();
    const settings = this.store.data.settings;
    this.menus?.select.show(this.store.data.bestLaps, this.store.data.raceBest, {
      trackId: this.world.track.def.id,
      carId: this.world.carDef.id,
      mode: settings.mode,
      difficulty: settings.difficulty,
    });
  }

  private onSelect(selection: Selection): void {
    const index = TRACKS.findIndex((t) => t.id === selection.trackId);
    const trackDef = TRACKS[index];
    const carDef = carById(selection.carId);
    if (!trackDef || !carDef || !isTrackUnlocked(TRACKS, index, this.store.data.bestLaps)) return;
    this.select(selection, trackDef, carDef);
    this.startRace();
  }

  private startRace(): void {
    let world = this.world;
    if (world.mode === 'race') {
      // Cada carrera tiene su propia semilla: los rivales varían un poco de una a otra.
      this.worlds.nextAttempt();
      world = this.createWorld(world.track.def, world.carDef, 'race', world.difficulty);
      this.world = world;
      this.debug?.syncInputs();
    } else {
      world.reset();
      world.assists = { ...this.store.data.settings.assists };
    }
    this.recorder.begin(world);
    this.hud?.reset();
    this.view.resetRace();
    this.audio.resetRace();
    this.sound.reseedMusic(world.seed);
    this.menus?.hideAll();
    if (this.hud) setVisible(this.hud.root, true);
    this.play();
  }

  private play(): void {
    this.screen = 'playing';
    this.input.clearAll();
    this.accumulator.reset();
    // La medición de FPS empieza de cero: el tiempo en menús o en pausa no cuenta.
    this.renderScale.restart();
    this.needsRender = true;
    this.updateAudioState();
    this.gameElement.focus({ preventScroll: true });
  }

  private pause(focusLost: boolean): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.input.clearKeyboard();
    this.needsRender = true;
    this.updateAudioState();
    this.menus?.pause.show(focusLost);
  }

  private resume(): void {
    if (this.screen !== 'paused' || this.contextLost) return;
    this.menus?.pause.hide();
    this.play();
  }

  private showResults(): void {
    this.screen = 'results';
    this.input.clearKeyboard();
    this.needsRender = true;
    this.updateAudioState();
    // El HUD se oculta para que los resultados se lean sin nada detrás.
    if (this.hud) setVisible(this.hud.root, false);
    this.menus?.results.show(this.recorder.results(this.world));
  }

  private nextTrack(): void {
    const index = TRACKS.findIndex((t) => t.id === this.world.track.def.id);
    const nextDef = TRACKS[index + 1];
    if (!nextDef || !isTrackUnlocked(TRACKS, index + 1, this.store.data.bestLaps)) return;
    const settings = this.store.data.settings;
    this.select(
      {
        trackId: nextDef.id,
        carId: this.world.carDef.id,
        mode: this.world.mode,
        difficulty: settings.difficulty,
      },
      nextDef,
      this.world.carDef,
    );
    this.startRace();
  }

  private toMenu(): void {
    this.menus?.hideAll();
    this.world.reset();
    this.recorder.resetLaps();
    this.hud?.reset();
    this.view.clearParticles();
    if (this.hud) setVisible(this.hud.root, false);
    this.screen = 'menu';
    this.updateAudioState();
    this.needsRender = true;
    this.menus?.start.show(this.store.data.settings.reducedMotion);
  }

  private openSettings(from: 'menu' | 'paused'): void {
    this.settingsReturn = from;
    this.menus?.hideAll();
    this.screen = 'settings';
    this.updateAudioState();
    this.menus?.settings.show(this.store.data.settings);
  }

  private closeSettings(): void {
    this.menus?.settings.hide();
    this.screen = this.settingsReturn;
    if (this.settingsReturn === 'menu') {
      this.menus?.start.show(this.store.data.settings.reducedMotion);
    } else {
      this.menus?.pause.show(false);
    }
  }

  private changeSettings(patch: Partial<Settings>): void {
    // Cambiar la calidad o apagar la resolución dinámica devuelve la resolución interna a la completa.
    if (patch.quality !== undefined || patch.dynamicResolution === false) {
      patch = { ...patch, renderScale: 1 };
    }
    this.store.updateSettings(patch);
    this.applySettings();
    if (patch.quality !== undefined) this.ensureScene();
    if (patch.reducedMotion !== undefined) this.view.clearParticles();
  }

  private toggleMute(): void {
    this.changeSettings({ muted: !this.store.data.settings.muted });
  }

  private applySettings(): void {
    const settings = this.store.data.settings;
    this.renderer?.setFov(settings.fov);
    this.renderScale.setScale(settings.renderScale);
    this.renderer?.setRenderScale(effectiveRenderScale(settings));
    this.hud?.setMuted(settings.muted);
    this.chase?.setMode(settings.camera, settings.reducedMotion);
    this.world.assists = { ...settings.assists };
    this.sound.setMuted(settings.muted);
    this.sound.setVolume(settings.volume);
    this.sound.setMusic(settings.music);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
    this.needsRender = true;
  }

  private onContextLost(): void {
    this.contextLost = true;
    if (this.screen === 'fatal') return;
    this.pause(false);
    this.message.show(TEXTS.errors.contextLostTitle, TEXTS.errors.contextLost);
  }

  private onContextRestored(): void {
    this.contextLost = false;
    if (this.screen === 'fatal') return;
    this.message.hide();
    this.needsRender = true;
  }
}
