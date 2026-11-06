import { createControls, InputState, type Action } from './core/input';
import { FixedStepAccumulator } from './core/loop';
import { lerp, lerpAngle, wrapAngle } from './core/math';
import { parseDebugFlag } from './core/url';
import { HUD, QUALITY, SIM, STEP_SECONDS } from './data/balance';
import { CARS, carById, type CarDef } from './data/cars';
import { TEXTS } from './data/texts';
import { TRACKS, type TrackDef } from './data/tracks';
import { GhostPlayer, validateGhost, type GhostData, type GhostPose } from './game/ghost';
import { isTrackUnlocked, medalFor } from './game/progress';
import { stepsToMs } from './game/race';
import { Track, createTrackQuery } from './game/track';
import { World } from './game/world';
import { ChaseCamera } from './render/camera';
import { CarMesh } from './render/car-mesh';
import { disposeObject } from './render/dispose';
import { Hud } from './render/hud';
import { GameRenderer } from './render/scene';
import { TrackScene } from './render/track-scene';
import { GhostStore } from './save/ghost-storage';
import { SaveStore, browserStorage, defaultSave, type Settings } from './save/storage';
import { DebugOverlay } from './ui/debug-overlay';
import { el, setVisible } from './ui/dom';
import { attachKeyboard } from './ui/keyboard';
import { MessageScreen } from './ui/message-screen';
import { PauseMenu } from './ui/pause-menu';
import { ResultsScreen } from './ui/results-screen';
import { SelectScreen, type Selection } from './ui/select-screen';
import { SettingsPanel } from './ui/settings-panel';
import { StartScreen } from './ui/start-screen';

type Screen = 'menu' | 'select' | 'settings' | 'playing' | 'paused' | 'results' | 'fatal';

/** Pose de un coche para el render, con la altura y la inclinación que da la pista. */
interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
}

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
  private readonly ghostStore: GhostStore;
  private readonly gameElement: HTMLElement;
  private readonly overlay: HTMLElement;
  private readonly message = new MessageScreen();
  private readonly tracks = new Map<string, Track>();
  private world: World;
  private renderer: GameRenderer | null = null;
  private chase: ChaseCamera | null = null;
  private hud: Hud | null = null;
  private startScreen: StartScreen | null = null;
  private pauseMenu: PauseMenu | null = null;
  private settingsPanel: SettingsPanel | null = null;
  private selectScreen: SelectScreen | null = null;
  private resultsScreen: ResultsScreen | null = null;
  private debug: DebugOverlay | null = null;
  private trackScene: TrackScene | null = null;
  private sceneKey = '';
  private carMesh: CarMesh | null = null;
  private carMeshId = '';
  private ghostMesh: CarMesh | null = null;
  private ghostMeshCarId = '';
  private ghostPlayer: GhostPlayer | null = null;
  private ghostLapMs: number | null = null;
  private readonly renderQuery = createTrackQuery();
  private readonly ghostPose: GhostPose = { x: 0, z: 0, heading: 0 };
  private readonly pose: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  private contextLost = false;
  private needsRender = true;
  private lastFrame = 0;
  private seenTeleports = -1;
  private seenLaps = 0;
  private seenGhostVersion = 0;
  private recordAtStart: number | null = null;
  private unlockedAtStart: boolean[] = [];

  constructor(private readonly root: HTMLElement) {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const storage = browserStorage();
    this.store = new SaveStore(storage, defaultSave(prefersReduced));
    this.ghostStore = new GhostStore(storage);
    const first = this.initialSelection();
    this.world = this.createWorld(first.track, first.car);

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
    this.gameElement.appendChild(this.hud.root);
    setVisible(this.hud.root, false);

    this.startScreen = new StartScreen(
      {
        onPlay: () => this.openSelect(),
        onSettings: () => this.openSettings('menu'),
        onReducedMotion: (reducedMotion) => this.changeSettings({ reducedMotion }),
      },
      settings.reducedMotion,
    );
    this.pauseMenu = new PauseMenu({
      onResume: () => this.resume(),
      onRestart: () => this.startRace(),
      onSelect: () => this.openSelect(),
      onSettings: () => this.openSettings('paused'),
      onMenu: () => this.toMenu(),
    });
    this.settingsPanel = new SettingsPanel(
      (patch) => this.changeSettings(patch),
      () => this.closeSettings(),
    );
    this.selectScreen = new SelectScreen(
      (selection) => this.onSelect(selection),
      () => this.toMenu(),
    );
    this.resultsScreen = new ResultsScreen({
      onRetry: () => this.startRace(),
      onNext: () => this.nextTrack(),
      onSelect: () => this.openSelect(),
      onMenu: () => this.toMenu(),
    });
    this.overlay.append(
      this.startScreen.root,
      this.pauseMenu.root,
      this.settingsPanel.root,
      this.selectScreen.root,
      this.resultsScreen.root,
    );
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

    this.ensureScene(true);
    this.applySettings();
    this.startScreen.show(settings.reducedMotion);
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------------------------------------
  // Circuito, coche y fantasma

  private getTrack(def: TrackDef): Track {
    let track = this.tracks.get(def.id);
    if (!track) {
      track = new Track(def);
      this.tracks.set(def.id, track);
    }
    return track;
  }

  /** Última selección guardada, si el circuito sigue abierto; si no, el primero. */
  private initialSelection(): { track: TrackDef; car: CarDef } {
    const settings = this.store.data.settings;
    const index = TRACKS.findIndex((t) => t.id === settings.lastTrackId);
    const unlocked = index >= 0 && isTrackUnlocked(TRACKS, index, this.store.data.bestLaps);
    const track = (unlocked ? TRACKS[index] : TRACKS[0]) ?? TRACKS[0];
    const car = carById(settings.lastCarId) ?? CARS[0];
    if (!track || !car) throw new Error('Faltan circuitos o coches');
    return { track, car };
  }

  private createWorld(trackDef: TrackDef, carDef: CarDef): World {
    return new World(
      this.getTrack(trackDef),
      carDef,
      this.store.getBestLap(trackDef.id, carDef.id),
    );
  }

  /** Construye lo visual del circuito actual si cambió el circuito o la calidad (o si `force`). */
  private ensureScene(force = false): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const settings = this.store.data.settings;
    const track = this.world.track;
    const key = `${track.def.id}|${settings.quality}`;
    if (force || key !== this.sceneKey) {
      const quality = QUALITY[settings.quality];
      this.trackScene?.dispose();
      renderer.setShadows(quality.shadows);
      renderer.setMaxPixelRatio(quality.maxPixelRatio);
      this.trackScene = new TrackScene(renderer.scene, track, quality);
      this.sceneKey = key;
      // Las mallas de coche se rehacen para que sus materiales usen la configuración de sombras nueva.
      this.carMeshId = '';
      this.ghostMeshCarId = '';
      this.hud?.minimap.setTrack(track);
    }
    if (this.carMeshId !== this.world.carDef.id) {
      if (this.carMesh) {
        renderer.scene.remove(this.carMesh.group);
        disposeObject(this.carMesh.group);
      }
      this.carMesh = new CarMesh(this.world.carDef);
      renderer.scene.add(this.carMesh.group);
      this.carMeshId = this.world.carDef.id;
    }
    this.loadGhost();
    this.seenTeleports = -1;
    this.needsRender = true;
  }

  /** Carga el fantasma guardado del circuito actual (si es válido). */
  private loadGhost(): void {
    const track = this.world.track;
    const data = this.ghostStore.load(track.def.id);
    if (data && validateGhost(data, track)) {
      this.setGhost(data);
    } else {
      this.ghostPlayer = null;
      this.ghostLapMs = null;
      this.ghostMesh?.setVisible(false);
    }
  }

  private setGhost(data: GhostData): void {
    const renderer = this.renderer;
    this.ghostPlayer = new GhostPlayer(data, this.world.track);
    this.ghostLapMs = data.lapMs;
    const carDef = carById(data.carId) ?? this.world.carDef;
    if (renderer && this.ghostMeshCarId !== carDef.id) {
      if (this.ghostMesh) {
        renderer.scene.remove(this.ghostMesh.group);
        disposeObject(this.ghostMesh.group);
      }
      this.ghostMesh = new CarMesh(carDef, true);
      renderer.scene.add(this.ghostMesh.group);
      this.ghostMeshCarId = carDef.id;
    }
    this.ghostMesh?.setVisible(false);
  }

  private select(trackDef: TrackDef, carDef: CarDef): void {
    this.world = this.createWorld(trackDef, carDef);
    this.store.updateSettings({ lastTrackId: trackDef.id, lastCarId: carDef.id });
    this.ensureScene();
    this.debug?.syncInputs();
  }

  // ---------------------------------------------------------------------------------------------
  // Bucle de frames

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
    this.debug?.update(now, dt, renderer.stats);
  };

  /** Reacciona a lo que pasó en los pasos de simulación: récords, fantasma y fin de la sesión. */
  private afterSteps(): void {
    const world = this.world;
    const race = world.race;
    const trackId = world.track.def.id;
    if (race.lapsCompleted > this.seenLaps) {
      this.seenLaps = race.lapsCompleted;
      if (race.lastLapMs !== null) this.store.recordLap(trackId, world.carDef.id, race.lastLapMs);
    }
    if (world.ghostVersion !== this.seenGhostVersion) {
      this.seenGhostVersion = world.ghostVersion;
      const ghost = world.lastGhost;
      // El fantasma del circuito es la mejor vuelta con cualquier coche.
      if (ghost && (this.ghostLapMs === null || ghost.lapMs < this.ghostLapMs)) {
        this.ghostStore.save(ghost);
        this.setGhost(ghost);
      }
    }
    if (race.phase === 'finished') this.showResults();
  }

  /** Pose de un coche con la altura, el cabeceo y el balanceo que da la pista en ese punto. */
  private computePose(x: number, z: number, heading: number): Pose {
    const q = this.world.track.query(x, z, this.renderQuery);
    const trackHeading = Math.atan2(-q.tangentZ, q.tangentX);
    const diff = wrapAngle(heading - trackHeading);
    const c = Math.cos(diff);
    const s = Math.sin(diff);
    const pose = this.pose;
    pose.x = x;
    pose.y = q.height;
    pose.z = z;
    pose.heading = heading;
    // Pendiente en la dirección del coche (cabeceo) y hacia su lado izquierdo (balanceo).
    pose.pitch = Math.atan(q.grade * c + q.bank * s);
    pose.roll = Math.atan(q.bank * c - q.grade * s);
    return pose;
  }

  private draw(dt: number): void {
    const renderer = this.renderer;
    const chase = this.chase;
    if (!renderer || !chase || !this.carMesh || !this.hud || !this.trackScene) return;
    const world = this.world;
    const prev = world.previousCar;
    const car = world.car;
    const a = this.screen === 'playing' ? this.accumulator.alpha : 1;
    const pose = this.computePose(
      lerp(prev.x, car.x, a),
      lerp(prev.z, car.z, a),
      lerpAngle(prev.heading, car.heading, a),
    );
    const { x, y, z, heading } = pose;
    this.carMesh.update(
      x,
      y,
      z,
      heading,
      pose.pitch,
      pose.roll,
      lerp(prev.steer, car.steer, a),
      lerpAngle(prev.wheelAngle, car.wheelAngle, a),
    );
    if (world.teleports !== this.seenTeleports) {
      // Tras reaparecer o reiniciar la cámara se coloca directamente (corte), sin barrido brusco.
      this.seenTeleports = world.teleports;
      chase.snap(x, y, z, heading);
    } else {
      chase.update(x, y, z, heading, dt, this.store.data.settings.reducedMotion);
    }
    this.trackScene.environment.followTarget(x, y, z);

    // Fantasma: el mismo paso de la vuelta que el jugador, interpolado.
    let ghostX: number | null = null;
    let ghostZ: number | null = null;
    const race = world.race;
    const ghostStep = Math.max(0, race.lapSteps - 1 + a);
    const ghostVisible =
      this.ghostPlayer !== null &&
      race.phase === 'racing' &&
      this.ghostPlayer.poseAt(ghostStep, this.ghostPose);
    if (this.ghostMesh) {
      this.ghostMesh.setVisible(ghostVisible);
      if (ghostVisible) {
        const g = this.ghostPose;
        const gp = this.computePose(g.x, g.z, g.heading);
        this.ghostMesh.update(gp.x, gp.y, gp.z, gp.heading, gp.pitch, gp.roll, 0, 0);
        ghostX = g.x;
        ghostZ = g.z;
      }
    }

    const cam = renderer.camera.position;
    this.trackScene.environment.follow(cam.x, cam.y, cam.z);
    this.hud.update(world, car.forwardSpeed, this.ghostDelta());
    this.hud.minimap.draw(car.x, car.z, ghostX, ghostZ);
    renderer.render();
    this.needsRender = this.screen === 'playing';
  }

  /** Diferencia con el fantasma en el mismo punto de la vuelta (ms), o null si no se puede comparar. */
  private ghostDelta(): number | null {
    const race = this.world.race;
    if (!this.ghostPlayer || race.phase !== 'racing') return null;
    if (race.lapDistance < HUD.ghostDeltaMinDistance) return null;
    const ghostMs = this.ghostPlayer.timeAtDistance(race.lapDistance);
    return ghostMs === null ? null : stepsToMs(race.lapSteps) - ghostMs;
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

  private hideScreens(): void {
    this.startScreen?.hide();
    this.pauseMenu?.hide();
    this.settingsPanel?.hide();
    this.selectScreen?.hide();
    this.resultsScreen?.hide();
  }

  private openSelect(): void {
    this.hideScreens();
    this.screen = 'select';
    this.selectScreen?.show(this.store.data.bestLaps, {
      trackId: this.world.track.def.id,
      carId: this.world.carDef.id,
    });
  }

  private onSelect(selection: Selection): void {
    const index = TRACKS.findIndex((t) => t.id === selection.trackId);
    const trackDef = TRACKS[index];
    const carDef = carById(selection.carId);
    if (!trackDef || !carDef || !isTrackUnlocked(TRACKS, index, this.store.data.bestLaps)) return;
    this.select(trackDef, carDef);
    this.startRace();
  }

  private startRace(): void {
    const world = this.world;
    world.reset();
    this.seenLaps = 0;
    this.seenGhostVersion = world.ghostVersion;
    this.recordAtStart = this.store.getBestLap(world.track.def.id, world.carDef.id);
    this.unlockedAtStart = TRACKS.map((_, i) =>
      isTrackUnlocked(TRACKS, i, this.store.data.bestLaps),
    );
    this.hud?.reset();
    this.hideScreens();
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

  private showResults(): void {
    const world = this.world;
    const race = world.race;
    const def = world.track.def;
    this.screen = 'results';
    this.input.clear();
    this.needsRender = true;
    // El HUD se oculta para que los resultados se lean sin nada detrás.
    if (this.hud) setVisible(this.hud.root, false);
    const bestLaps = this.store.data.bestLaps;
    const index = TRACKS.findIndex((t) => t.id === def.id);
    const nextDef = TRACKS[index + 1];
    const nextUnlocked = nextDef !== undefined && isTrackUnlocked(TRACKS, index + 1, bestLaps);
    const session = race.sessionBestMs;
    this.resultsScreen?.show({
      trackName: def.name,
      carName: world.carDef.name,
      lapTimes: race.lapTimes,
      sessionBestMs: session,
      medal: medalFor(def, session),
      recordMs: this.store.getBestLap(def.id, world.carDef.id),
      newRecord: session !== null && (this.recordAtStart === null || session < this.recordAtStart),
      unlockedTrack:
        nextDef && nextUnlocked && this.unlockedAtStart[index + 1] === false ? nextDef.name : null,
      hasNext: nextUnlocked,
    });
  }

  private nextTrack(): void {
    const index = TRACKS.findIndex((t) => t.id === this.world.track.def.id);
    const nextDef = TRACKS[index + 1];
    if (!nextDef || !isTrackUnlocked(TRACKS, index + 1, this.store.data.bestLaps)) return;
    this.select(nextDef, this.world.carDef);
    this.startRace();
  }

  private toMenu(): void {
    this.hideScreens();
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
    this.hideScreens();
    this.screen = 'settings';
    this.settingsPanel?.show(this.store.data.settings);
  }

  private closeSettings(): void {
    this.settingsPanel?.hide();
    this.screen = this.settingsReturn;
    if (this.settingsReturn === 'menu') {
      this.startScreen?.show(this.store.data.settings.reducedMotion);
    } else {
      this.pauseMenu?.show(false);
    }
  }

  private changeSettings(patch: Partial<Settings>): void {
    this.store.updateSettings(patch);
    this.applySettings();
    if (patch.quality !== undefined) this.ensureScene();
  }

  private toggleMute(): void {
    this.changeSettings({ muted: !this.store.data.settings.muted });
  }

  private applySettings(): void {
    const settings = this.store.data.settings;
    this.renderer?.setFov(settings.fov);
    this.hud?.setMuted(settings.muted);
    this.chase?.setMode(settings.camera, settings.reducedMotion);
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
