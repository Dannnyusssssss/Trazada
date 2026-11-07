import { createEngineVoice, engineVoice, Gearbox } from './audio/engine';
import { CueTracker, impactLevel, rivalMix, windLevel } from './audio/sfx';
import { SoundEngine, type SoundFrame } from './audio/web/sound-engine';
import { mergeControls, padToControls, PadButtons } from './core/gamepad';
import { createControls, InputState, type Action } from './core/input';
import { FixedStepAccumulator } from './core/loop';
import { lerp, lerpAngle, wrapAngle } from './core/math';
import { parseDebugFlag } from './core/url';
import { AUDIO, EFFECTS, HUD, QUALITY, SIM, STEP_SECONDS, type Difficulty } from './data/balance';
import { CARS, carById, type CarDef } from './data/cars';
import { TEXTS } from './data/texts';
import { TRACKS, type TrackDef } from './data/tracks';
import { BrakeLight, RateLimiter, skidIntensity } from './game/feedback';
import { GhostPlayer, validateGhost, type GhostData, type GhostPose } from './game/ghost';
import { isTrackUnlocked, medalFor } from './game/progress';
import { stepsToMs } from './game/race';
import type { Racer } from './game/racer';
import { Track, createTrackQuery } from './game/track';
import { raceSeed, World, type GameMode } from './game/world';
import { CameraEffects, ChaseCamera } from './render/camera';
import { CarMesh } from './render/car-mesh';
import { disposeObject } from './render/dispose';
import { Hud } from './render/hud';
import type { MinimapDot } from './render/minimap';
import { ParticleEffects } from './render/particles';
import { GameRenderer } from './render/scene';
import { TrackScene } from './render/track-scene';
import { GhostStore } from './save/ghost-storage';
import { SaveStore, browserStorage, defaultSave, type Settings } from './save/storage';
import { DebugOverlay } from './ui/debug-overlay';
import { el, setVisible } from './ui/dom';
import { GamepadReader } from './ui/gamepad';
import { attachKeyboard } from './ui/keyboard';
import { MessageScreen } from './ui/message-screen';
import { PauseMenu } from './ui/pause-menu';
import { ResultsScreen, type Standing } from './ui/results-screen';
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

/** Tiempo que el indicador de derrape del HUD sigue visible tras terminar el derrape (s). */
const DRIFT_HOLD_SECONDS = 0.35;
/** Derrape mínimo (0..1) que enciende el indicador, deja marcas o suena. */
const DRIFT_THRESHOLD = 0.25;

/**
 * Orquesta el juego en el navegador: pantallas, bucle de frames, entrada (teclado y mando), render,
 * efectos, sonido y guardado. La lógica avanza en pasos fijos dentro de `World`; aquí solo se decide cuándo
 * avanzar y qué mostrar.
 */
export class App {
  private screen: Screen = 'menu';
  private settingsReturn: 'menu' | 'paused' = 'menu';
  private readonly input = new InputState();
  private readonly keyboardControls = createControls();
  private readonly padControls = createControls();
  private readonly controls = createControls();
  private readonly gamepad = new GamepadReader();
  private readonly padButtons = new PadButtons();
  private readonly padActions: Action[] = [];
  private padRespawn = false;
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
  private raceAttempt = 0;
  private renderer: GameRenderer | null = null;
  private chase: ChaseCamera | null = null;
  private readonly cameraEffects = new CameraEffects();
  private hud: Hud | null = null;
  private startScreen: StartScreen | null = null;
  private pauseMenu: PauseMenu | null = null;
  private settingsPanel: SettingsPanel | null = null;
  private selectScreen: SelectScreen | null = null;
  private resultsScreen: ResultsScreen | null = null;
  private debug: DebugOverlay | null = null;
  private trackScene: TrackScene | null = null;
  private particles: ParticleEffects | null = null;
  private sceneKey = '';
  private carMesh: CarMesh | null = null;
  private carMeshId = '';
  /** Mallas de los rivales (en el orden de `world.racers`, sin el jugador). */
  private rivalMeshes: CarMesh[] = [];
  private rivalMeshKey = '';
  private ghostMesh: CarMesh | null = null;
  private ghostMeshCarId = '';
  private ghostPlayer: GhostPlayer | null = null;
  private ghostLapMs: number | null = null;
  private readonly renderQuery = createTrackQuery();
  private readonly ghostPose: GhostPose = { x: 0, z: 0, heading: 0 };
  private readonly pose: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  /** Estado por coche para el render: teletransportes vistos, luces de freno, humo, golpes y motor. */
  private seenRacerTeleports: number[] = [];
  private brakeLights: BrakeLight[] = [];
  private smokeBudget: number[] = [];
  private stepImpacts: number[] = [];
  private gearboxes: Gearbox[] = [];
  /** Color CSS de cada coche para el minimapa (se calcula una vez por carrera). */
  private racerColors: string[] = [];
  private readonly sparkLimiter = new RateLimiter(EFFECTS.sparkInterval);
  private readonly minimapDots: MinimapDot[] = [];
  private driftHold = 0;
  private readonly sound = new SoundEngine();
  private readonly cues = new CueTracker();
  private readonly impactLimiter = new RateLimiter(AUDIO.impactInterval);
  private readonly engineVoice = createEngineVoice();
  private readonly rivalVoices = [createEngineVoice(), createEngineVoice()];
  private readonly rivalMixes = [
    { frequency: 0, gain: 0, pan: 0 },
    { frequency: 0, gain: 0, pan: 0 },
  ];
  private readonly mixTmp = { gain: 0, pan: 0 };
  private readonly soundFrame: SoundFrame = {
    driving: false,
    engine: this.engineVoice,
    skid: 0,
    wind: 0,
    rivals: this.rivalMixes,
    rivalCount: 0,
  };
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
    const settings = this.store.data.settings;
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
    // El audio solo puede empezar tras un gesto del jugador (política de reproducción automática).
    const unlockAudio = (): void => this.sound.unlock();
    window.addEventListener('pointerdown', unlockAudio, { capture: true });
    window.addEventListener('keydown', unlockAudio, { capture: true });
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
  // Circuito, coches y fantasma

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

  private createWorld(
    trackDef: TrackDef,
    carDef: CarDef,
    mode: GameMode,
    difficulty: Difficulty,
  ): World {
    // En Carrera los récords de vuelta no se usan: solo cuentan los de la contrarreloj.
    const best = mode === 'timeTrial' ? this.store.getBestLap(trackDef.id, carDef.id) : null;
    const world = new World(this.getTrack(trackDef), carDef, best, {
      mode,
      difficulty,
      seed: raceSeed(trackDef.id, difficulty, this.raceAttempt),
    });
    world.assists = { ...this.store.data.settings.assists };
    const n = world.racers.length;
    this.seenRacerTeleports = new Array<number>(n).fill(-1);
    this.brakeLights = world.racers.map(() => new BrakeLight());
    this.smokeBudget = new Array<number>(n).fill(0);
    this.stepImpacts = new Array<number>(n).fill(0);
    this.gearboxes = world.racers.map(() => new Gearbox());
    this.racerColors = world.racers.map((r) => `#${r.bodyColor.toString(16).padStart(6, '0')}`);
    return world;
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
      this.particles?.dispose();
      renderer.setShadows(quality.shadows);
      renderer.setMaxPixelRatio(quality.maxPixelRatio);
      this.trackScene = new TrackScene(renderer.scene, track, quality);
      this.particles = new ParticleEffects(renderer.scene, 8);
      this.sceneKey = key;
      // Las mallas de coche se rehacen para que sus materiales usen la configuración de sombras nueva
      // (y los faros, si el circuito es nocturno).
      this.carMeshId = '';
      this.ghostMeshCarId = '';
      this.rivalMeshKey = '';
      this.hud?.minimap.setTrack(track);
    }
    const night = track.def.night;
    if (this.carMeshId !== this.world.carDef.id) {
      if (this.carMesh) {
        renderer.scene.remove(this.carMesh.group);
        disposeObject(this.carMesh.group);
      }
      this.carMesh = new CarMesh(this.world.carDef, { night });
      renderer.scene.add(this.carMesh.group);
      this.carMeshId = this.world.carDef.id;
    }
    this.ensureRivalMeshes();
    this.loadGhost();
    this.seenTeleports = -1;
    this.needsRender = true;
  }

  /** Crea (o quita) las mallas de los rivales según los coches del mundo actual. */
  private ensureRivalMeshes(): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const rivals = this.world.racers.slice(1);
    const key = rivals.map((r) => `${r.carDef.id}:${r.bodyColor}`).join(',');
    if (key === this.rivalMeshKey) return;
    for (const mesh of this.rivalMeshes) {
      renderer.scene.remove(mesh.group);
      disposeObject(mesh.group);
    }
    const night = this.world.track.def.night;
    this.rivalMeshes = rivals.map((racer) => {
      const mesh = new CarMesh(racer.carDef, { bodyColor: racer.bodyColor, night });
      renderer.scene.add(mesh.group);
      return mesh;
    });
    this.rivalMeshKey = key;
  }

  /** Carga el fantasma guardado del circuito actual (si es válido). Solo en contrarreloj. */
  private loadGhost(): void {
    const track = this.world.track;
    const data = this.world.mode === 'timeTrial' ? this.ghostStore.load(track.def.id) : null;
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
      this.ghostMesh = new CarMesh(carDef, { ghost: true });
      renderer.scene.add(this.ghostMesh.group);
      this.ghostMeshCarId = carDef.id;
    }
    this.ghostMesh?.setVisible(false);
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
    requestAnimationFrame(this.frame);
    const renderer = this.renderer;
    if (!renderer) return;
    const dt = this.lastFrame === 0 ? 0 : (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    this.pollGamepad();

    if (this.screen === 'playing' && !this.contextLost) {
      const steps = this.accumulator.advance(dt);
      this.stepImpacts.fill(0);
      for (let i = 0; i < steps; i++) {
        this.input.toControls(this.keyboardControls);
        mergeControls(this.keyboardControls, this.padControls, this.controls);
        const respawn = this.input.consume('respawn') || this.padRespawn;
        this.padRespawn = false;
        this.world.step({ controls: this.controls, respawn });
        // Golpes de cada coche en estos pasos (para chispas, sacudida y sonido).
        const racers = this.world.racers;
        for (let k = 0; k < racers.length; k++) {
          const racer = racers[k];
          if (!racer) continue;
          const impact = Math.max(racer.car.wallImpact, racer.carImpact);
          this.stepImpacts[k] = Math.max(this.stepImpacts[k] ?? 0, impact);
        }
      }
      this.afterSteps();
      this.needsRender = true;
    }
    const frameDt = Math.min(dt, SIM.maxFrameSeconds);
    if (this.needsRender && !this.contextLost) this.draw(frameDt);
    this.updateSound(frameDt);
    this.debug?.update(now, dt, renderer.stats);
  };

  /** Lee el mando (solo si hay uno conectado) y reparte sus controles y sus botones de un disparo. */
  private pollGamepad(): void {
    const pad = this.gamepad.active ? this.gamepad.poll() : null;
    if (!pad) {
      this.padControls.throttle = 0;
      this.padControls.brake = 0;
      this.padControls.steer = 0;
      this.padControls.handbrake = false;
      return;
    }
    padToControls(pad, this.padControls);
    const driving = this.screen === 'playing';
    for (const action of this.padButtons.update(pad, this.padActions)) {
      if (action === 'respawn') {
        if (driving) this.padRespawn = true;
      } else {
        this.onAction(action, driving);
      }
    }
  }

  /** Reacciona a lo que pasó en los pasos de simulación: récords, fantasma y fin de la sesión. */
  private afterSteps(): void {
    const world = this.world;
    const race = world.race;
    const trackId = world.track.def.id;
    const timeTrial = world.mode === 'timeTrial';
    if (race.lapsCompleted > this.seenLaps) {
      this.seenLaps = race.lapsCompleted;
      if (timeTrial && race.lastLapMs !== null) {
        this.store.recordLap(trackId, world.carDef.id, race.lastLapMs);
      }
    }
    if (timeTrial && world.ghostVersion !== this.seenGhostVersion) {
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

  /** Coloca la malla de un coche (interpolada entre pasos) y genera sus efectos. Devuelve su pose. */
  private drawRacer(
    racer: Racer,
    mesh: CarMesh,
    alpha: number,
    dt: number,
    camX: number,
    camZ: number,
  ): Pose {
    const prev = racer.previousCar;
    const car = racer.car;
    // Tras un teletransporte (reaparición, reinicio) no se interpola: se dibuja en su sitio nuevo.
    const k = racer.index;
    const teleported = this.seenRacerTeleports[k] !== racer.teleports;
    this.seenRacerTeleports[k] = racer.teleports;
    const a = teleported ? 1 : alpha;
    const pose = this.computePose(
      lerp(prev.x, car.x, a),
      lerp(prev.z, car.z, a),
      lerpAngle(prev.heading, car.heading, a),
    );
    mesh.update(
      pose.x,
      pose.y,
      pose.z,
      pose.heading,
      pose.pitch,
      pose.roll,
      lerp(prev.steer, car.steer, a),
      lerpAngle(prev.wheelAngle, car.wheelAngle, a),
    );
    const light = this.brakeLights[k];
    if (light) {
      mesh.setBrakeLight(light.update(racer.controls.brake > 0.1 && car.forwardSpeed > 0.5, dt));
    }
    if (teleported) this.particles?.skid(k, 0, false, 0, 0, 0);
    if (teleported) this.particles?.skid(k, 1, false, 0, 0, 0);
    if (Math.hypot(pose.x - camX, pose.z - camZ) < EFFECTS.maxDistance) {
      this.emitEffects(racer, pose, dt);
    }
    return pose;
  }

  /** Humo y marcas de derrape en las ruedas traseras, y chispas al chocar. */
  private emitEffects(racer: Racer, pose: Pose, dt: number): void {
    const particles = this.particles;
    if (!particles) return;
    const reduced = this.store.data.settings.reducedMotion;
    const car = racer.car;
    const k = racer.index;
    const intensity = this.screen === 'playing' ? skidIntensity(car, racer.controls) : 0;
    const shape = racer.carDef.shape;
    const fx = Math.cos(pose.heading);
    const fz = -Math.sin(pose.heading);
    // Normal izquierda del coche: (fz, -fx).
    const back = -1.28 * shape.length;
    const side = 0.82 * shape.width;
    const skidding = intensity > DRIFT_THRESHOLD;
    for (let w = 0; w < 2; w++) {
      const s = w === 0 ? side : -side;
      const x = pose.x + fx * back + fz * s;
      const z = pose.z + fz * back - fx * s;
      // Altura de la rueda según el cabeceo y el balanceo del coche.
      const y =
        pose.y + back * Math.tan(pose.pitch) + s * Math.tan(pose.roll) + EFFECTS.skidMarkLift;
      particles.skid(k, w, skidding, x, y, z);
      if (!reduced && intensity > 0 && w === 0) {
        // Humo: emisión por segundo proporcional al derrape, repartida entre frames.
        const budget = (this.smokeBudget[k] ?? 0) + EFFECTS.smokeRate * intensity * dt;
        let count = Math.floor(budget);
        this.smokeBudget[k] = budget - count;
        while (count-- > 0) {
          const wheelSide = count % 2 === 0 ? s : -s;
          particles.emitSmoke(
            pose.x + fx * back + fz * wheelSide,
            pose.y,
            pose.z + fz * back - fx * wheelSide,
            car.vx,
            car.vz,
            intensity,
          );
        }
      }
    }
    const impact = this.stepImpacts[k] ?? 0;
    if (!reduced && impact >= EFFECTS.sparkMinImpact && this.sparkLimiter.tryFire()) {
      // Las chispas de un golpe contra el muro salen hacia la pista; las de un choque entre coches, hacia arriba.
      let nx = 0;
      let nz = 0;
      if (car.wallImpact >= racer.carImpact) {
        const sign = racer.query.lateral > 0 ? 1 : -1;
        nx = -racer.query.tangentZ * sign;
        nz = racer.query.tangentX * sign;
      }
      particles.burstSparks(pose.x, pose.y, pose.z, nx, nz, impact / 10);
    }
  }

  private draw(dt: number): void {
    const renderer = this.renderer;
    const chase = this.chase;
    if (!renderer || !chase || !this.carMesh || !this.hud || !this.trackScene) return;
    const world = this.world;
    const car = world.car;
    const settings = this.store.data.settings;
    const playing = this.screen === 'playing';
    const a = playing ? this.accumulator.alpha : 1;
    const effectsDt = playing ? dt : 0;
    const cam = renderer.camera.position;
    const camX = cam.x;
    const camZ = cam.z;

    this.sparkLimiter.update(effectsDt);
    const pose = this.drawRacer(world.player, this.carMesh, a, effectsDt, camX, camZ);
    const { x, y, z, heading } = pose;
    if (world.teleports !== this.seenTeleports) {
      // Tras reaparecer o reiniciar la cámara se coloca directamente (corte), sin barrido brusco.
      this.seenTeleports = world.teleports;
      chase.snap(x, y, z, heading);
      this.cameraEffects.reset();
    } else {
      chase.update(x, y, z, heading, dt, settings.reducedMotion);
    }
    // Campo de visión con la velocidad y sacudida leve (nada con "Reducir movimiento").
    const playerImpact = this.stepImpacts[0] ?? 0;
    if (playing && playerImpact > EFFECTS.sparkMinImpact) this.cameraEffects.hit(playerImpact);
    this.cameraEffects.update(
      Math.abs(car.forwardSpeed) / world.params.maxSpeed,
      effectsDt,
      settings.reducedMotion,
    );
    renderer.camera.position.add(this.cameraEffects.shake);
    renderer.setFov(settings.fov + this.cameraEffects.fovOffset);
    this.trackScene.environment.followTarget(x, y, z);

    // Rivales.
    this.minimapDots.length = world.racers.length - 1;
    for (let i = 1; i < world.racers.length; i++) {
      const racer = world.racers[i];
      const mesh = this.rivalMeshes[i - 1];
      if (!racer || !mesh) continue;
      const p = this.drawRacer(racer, mesh, a, effectsDt, camX, camZ);
      const dot = this.minimapDots[i - 1] ?? { x: 0, z: 0, color: '' };
      dot.x = p.x;
      dot.z = p.z;
      dot.color = this.racerColors[i] ?? '#ffffff';
      this.minimapDots[i - 1] = dot;
    }
    this.particles?.update(effectsDt);

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

    // Indicador de derrape del HUD (también es la señal visual del chirrido).
    const drifting = playing && skidIntensity(car, world.appliedControls) > DRIFT_THRESHOLD;
    this.driftHold = drifting ? DRIFT_HOLD_SECONDS : Math.max(0, this.driftHold - effectsDt);

    this.trackScene.environment.follow(cam.x, cam.y, cam.z);
    this.hud.update(world, car.forwardSpeed, this.ghostDelta(), this.driftHold > 0);
    this.hud.minimap.draw(car.x, car.z, ghostX, ghostZ, this.minimapDots);
    renderer.render();
    this.needsRender = playing;
  }

  /** Sonido de este frame: motor, derrape, viento, rivales cercanos, golpes y avisos. */
  private updateSound(dt: number): void {
    const world = this.world;
    const player = world.player;
    const car = player.car;
    const playing = this.screen === 'playing';
    const frame = this.soundFrame;
    frame.driving = playing;
    const rpm = this.gearboxes[0]?.update(Math.abs(car.forwardSpeed) / player.params.maxSpeed) ?? 0;
    engineVoice(rpm, player.controls.throttle, this.engineVoice);
    frame.skid = playing ? skidIntensity(car, player.controls) : 0;
    frame.wind = windLevel(car.forwardSpeed, player.params.maxSpeed);

    // Los dos rivales más cercanos, con su motor atenuado por la distancia y su panorámica.
    let first: Racer | null = null;
    let second: Racer | null = null;
    let d1 = Infinity;
    let d2 = Infinity;
    for (let i = 1; i < world.racers.length; i++) {
      const r = world.racers[i];
      if (!r) continue;
      const d = Math.hypot(r.car.x - car.x, r.car.z - car.z);
      if (d < d1) {
        second = first;
        d2 = d1;
        first = r;
        d1 = d;
      } else if (d < d2) {
        second = r;
        d2 = d;
      }
    }
    frame.rivalCount = 0;
    if (first) this.mixRival(first, car.x, car.z, car.heading);
    if (second) this.mixRival(second, car.x, car.z, car.heading);
    this.sound.update(frame);

    // Los avisos se revisan también en los resultados: la llegada se detecta en el frame en que se abren.
    if (playing || this.screen === 'results') {
      const cue = this.cues.update(player.race);
      if (cue) this.sound.cue(cue);
    }
    if (playing) {
      this.impactLimiter.update(dt);
      const level = impactLevel(this.stepImpacts[0] ?? 0);
      if (level > 0 && this.impactLimiter.tryFire()) this.sound.impact(level);
    }
  }

  /** Añade el motor de un rival a la mezcla de este frame. */
  private mixRival(r: Racer, x: number, z: number, heading: number): void {
    const frame = this.soundFrame;
    const voice = this.rivalVoices[frame.rivalCount];
    const mix = this.rivalMixes[frame.rivalCount];
    const gearbox = this.gearboxes[r.index];
    if (!voice || !mix || !gearbox) return;
    const rpm = gearbox.update(Math.abs(r.car.forwardSpeed) / r.params.maxSpeed);
    engineVoice(rpm, r.controls.throttle, voice);
    rivalMix(r.car.x - x, r.car.z - z, heading, this.mixTmp);
    mix.frequency = voice.frequency;
    mix.gain = this.mixTmp.gain * voice.gain;
    mix.pan = this.mixTmp.pan;
    frame.rivalCount++;
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

  /** El audio suena mientras se conduce y en los resultados; en los menús se suspende. */
  private updateAudioState(): void {
    this.sound.setPaused(this.screen !== 'playing' && this.screen !== 'results');
  }

  private openSelect(): void {
    this.hideScreens();
    this.screen = 'select';
    this.updateAudioState();
    const settings = this.store.data.settings;
    this.selectScreen?.show(this.store.data.bestLaps, this.store.data.raceBest, {
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
      this.raceAttempt++;
      world = this.createWorld(world.track.def, world.carDef, 'race', world.difficulty);
      this.world = world;
      this.debug?.syncInputs();
    } else {
      world.reset();
      world.assists = { ...this.store.data.settings.assists };
    }
    this.seenLaps = 0;
    this.seenGhostVersion = world.ghostVersion;
    this.recordAtStart = this.store.getBestLap(world.track.def.id, world.carDef.id);
    this.unlockedAtStart = TRACKS.map((_, i) =>
      isTrackUnlocked(TRACKS, i, this.store.data.bestLaps),
    );
    this.hud?.reset();
    this.particles?.clear();
    this.cameraEffects.reset();
    this.cues.reset();
    this.driftHold = 0;
    for (const light of this.brakeLights) light.reset();
    for (const gearbox of this.gearboxes) gearbox.reset();
    this.sound.reseedMusic(world.seed);
    this.hideScreens();
    if (this.hud) setVisible(this.hud.root, true);
    this.play();
  }

  private play(): void {
    this.screen = 'playing';
    this.input.clear();
    this.padButtons.clear();
    this.accumulator.reset();
    this.needsRender = true;
    this.updateAudioState();
    this.gameElement.focus({ preventScroll: true });
  }

  private pause(focusLost: boolean): void {
    if (this.screen !== 'playing') return;
    this.screen = 'paused';
    this.input.clear();
    this.needsRender = true;
    this.updateAudioState();
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
    this.updateAudioState();
    // El HUD se oculta para que los resultados se lean sin nada detrás.
    if (this.hud) setVisible(this.hud.root, false);
    const bestLaps = this.store.data.bestLaps;
    const index = TRACKS.findIndex((t) => t.id === def.id);
    const nextDef = TRACKS[index + 1];
    const nextUnlocked = nextDef !== undefined && isTrackUnlocked(TRACKS, index + 1, bestLaps);
    const session = race.sessionBestMs;
    let raceResults = null;
    if (world.mode === 'race') {
      const position = world.positionOf(world.player);
      // Solo se celebra al mejorar un puesto anterior (no la primera carrera, que siempre es "récord").
      const previousBest = this.store.getRaceBest(def.id, world.difficulty);
      const improved = this.store.recordRacePosition(def.id, world.difficulty, position);
      const newBestPosition = improved && previousBest !== null;
      const standings: Standing[] = world.order.map((i) => {
        const racer = world.racers[i];
        return {
          name: racer?.name ?? '',
          timeMs: racer && racer.race.phase === 'finished' ? stepsToMs(racer.race.raceSteps) : null,
          isPlayer: racer === world.player,
        };
      });
      raceResults = {
        position,
        total: world.racers.length,
        totalMs: stepsToMs(race.raceSteps),
        standings,
        bestPosition: this.store.getRaceBest(def.id, world.difficulty),
        newBestPosition,
      };
    }
    this.resultsScreen?.show({
      trackName: def.name,
      carName: world.carDef.name,
      lapTimes: race.lapTimes,
      sessionBestMs: session,
      medal: medalFor(def, session),
      recordMs: this.store.getBestLap(def.id, world.carDef.id),
      newRecord:
        world.mode === 'timeTrial' &&
        session !== null &&
        (this.recordAtStart === null || session < this.recordAtStart),
      unlockedTrack:
        nextDef && nextUnlocked && this.unlockedAtStart[index + 1] === false ? nextDef.name : null,
      hasNext: nextUnlocked,
      race: raceResults,
    });
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
    this.hideScreens();
    this.world.reset();
    this.seenLaps = 0;
    this.hud?.reset();
    this.particles?.clear();
    if (this.hud) setVisible(this.hud.root, false);
    this.screen = 'menu';
    this.updateAudioState();
    this.needsRender = true;
    this.startScreen?.show(this.store.data.settings.reducedMotion);
  }

  private openSettings(from: 'menu' | 'paused'): void {
    this.settingsReturn = from;
    this.hideScreens();
    this.screen = 'settings';
    this.updateAudioState();
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
    if (patch.reducedMotion !== undefined) this.particles?.clear();
  }

  private toggleMute(): void {
    this.changeSettings({ muted: !this.store.data.settings.muted });
  }

  private applySettings(): void {
    const settings = this.store.data.settings;
    this.renderer?.setFov(settings.fov);
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
    this.pause(false);
    this.message.show(TEXTS.errors.contextLostTitle, TEXTS.errors.contextLost);
  }

  private onContextRestored(): void {
    this.contextLost = false;
    this.message.hide();
    this.needsRender = true;
  }
}
