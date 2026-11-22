import { lerp, lerpAngle, wrapAngle } from '../core/math';
import { EFFECTS, HUD, QUALITY, type Quality } from '../data/balance';
import { carById } from '../data/cars';
import { BrakeLight, skidIntensity } from '../game/feedback';
import { GhostPlayer, type GhostData, type GhostPose } from '../game/ghost';
import { stepsToMs } from '../game/race';
import type { Racer } from '../game/racer';
import { createTrackQuery } from '../game/track';
import type { World } from '../game/world';
import { CameraEffects, type ChaseCamera } from '../render/camera';
import { CarMesh } from '../render/car-mesh';
import { disposeObject } from '../render/dispose';
import type { Hud } from '../render/hud';
import type { MinimapDot } from '../render/minimap';
import { ParticleEffects } from '../render/particles';
import type { GameRenderer } from '../render/scene';
import { TrackScene } from '../render/track-scene';
import { DRIFT_THRESHOLD, RacerEffects, type Pose } from './race-effects';

/** Tiempo que el indicador de derrape del HUD sigue visible tras terminar el derrape (s). */
const DRIFT_HOLD_SECONDS = 0.35;
/** Clave de mallas que nunca coincide con una real: obliga a reconstruirlas. */
const REBUILD_KEY = '#rebuild';

/**
 * Lo visual de la carrera: escena del circuito, mallas del jugador, los rivales y el fantasma, efectos
 * (humo, marcas, chispas, luces de freno), cámara y HUD de cada frame. Solo lee el estado del juego.
 */
export class RaceView {
  readonly cameraEffects = new CameraEffects();
  private renderer: GameRenderer | null = null;
  private chase: ChaseCamera | null = null;
  private hud: Hud | null = null;
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
  /** Tiempo de vuelta del fantasma cargado (ms), o null si no hay fantasma. */
  ghostLapMs: number | null = null;
  private readonly renderQuery = createTrackQuery();
  private readonly ghostPose: GhostPose = { x: 0, z: 0, heading: 0 };
  private readonly pose: Pose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0 };
  /** Estado por coche para el render: teletransportes vistos y luces de freno. */
  private seenRacerTeleports: number[] = [];
  private brakeLights: BrakeLight[] = [];
  /** Color CSS de cada coche para el minimapa (se calcula una vez por carrera). */
  private racerColors: string[] = [];
  private readonly minimapDots: MinimapDot[] = [];
  private driftHold = 0;
  private seenTeleports = -1;
  /** Datos del frame en curso, fijados al empezar `draw` para no pasarlos a cada coche. */
  private playing = false;
  private reducedMotion = false;

  /** Conecta el render, la cámara y el HUD (existen solo si WebGL arrancó). */
  attach(renderer: GameRenderer, chase: ChaseCamera, hud: Hud): void {
    this.renderer = renderer;
    this.chase = chase;
    this.hud = hud;
  }

  /** Prepara el estado por coche de un mundo nuevo. */
  resetRacers(world: World): void {
    const n = world.racers.length;
    this.seenRacerTeleports = new Array<number>(n).fill(-1);
    this.brakeLights = world.racers.map(() => new BrakeLight());
    this.effects.resetRacers(n);
    this.racerColors = world.racers.map((r) => `#${r.bodyColor.toString(16).padStart(6, '0')}`);
  }

  /** Limpia los efectos al empezar una sesión. */
  resetRace(): void {
    this.particles?.clear();
    this.cameraEffects.reset();
    this.driftHold = 0;
    for (const light of this.brakeLights) light.reset();
  }

  clearParticles(): void {
    this.particles?.clear();
  }

  /** La próxima vez que se dibuje, la cámara se coloca directamente (corte). */
  snapCamera(): void {
    this.seenTeleports = -1;
  }

  /** Golpes y efectos por coche (también los usa el sonido). */
  readonly effects = new RacerEffects();

  /**
   * Construye lo visual del circuito si cambió el circuito o la calidad (o si `force`) y las mallas de los
   * coches. Devuelve false si no hay render.
   */
  ensureScene(world: World, qualityName: Quality, force: boolean): boolean {
    const renderer = this.renderer;
    if (!renderer) return false;
    const track = world.track;
    const key = `${track.def.id}|${qualityName}`;
    if (force || key !== this.sceneKey) {
      const quality = QUALITY[qualityName];
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
      // Una clave imposible fuerza a rehacer las mallas de los rivales. Con '' una contrarreloj (sin rivales)
      // coincidiría con la clave vacía y dejaría en la escena los coches de la carrera anterior.
      this.rivalMeshKey = REBUILD_KEY;
      this.hud?.minimap.setTrack(track);
    }
    const night = track.def.night;
    if (this.carMeshId !== world.carDef.id) {
      if (this.carMesh) {
        renderer.scene.remove(this.carMesh.group);
        disposeObject(this.carMesh.group);
      }
      this.carMesh = new CarMesh(world.carDef, { night });
      renderer.scene.add(this.carMesh.group);
      this.carMeshId = world.carDef.id;
    }
    this.ensureRivalMeshes(world);
    return true;
  }

  /** Crea (o quita) las mallas de los rivales según los coches del mundo actual. */
  private ensureRivalMeshes(world: World): void {
    const renderer = this.renderer;
    if (!renderer) return;
    const rivals = world.racers.slice(1);
    const key = rivals.map((r) => `${r.carDef.id}:${r.bodyColor}`).join(',');
    if (key === this.rivalMeshKey) return;
    for (const mesh of this.rivalMeshes) {
      renderer.scene.remove(mesh.group);
      disposeObject(mesh.group);
    }
    const night = world.track.def.night;
    this.rivalMeshes = rivals.map((racer) => {
      const mesh = new CarMesh(racer.carDef, { bodyColor: racer.bodyColor, night });
      renderer.scene.add(mesh.group);
      return mesh;
    });
    this.rivalMeshKey = key;
  }

  /** Usa un fantasma (ya validado) y prepara su malla translúcida. */
  setGhost(data: GhostData, world: World): void {
    const renderer = this.renderer;
    this.ghostPlayer = new GhostPlayer(data, world.track);
    this.ghostLapMs = data.lapMs;
    const carDef = carById(data.carId) ?? world.carDef;
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

  clearGhost(): void {
    this.ghostPlayer = null;
    this.ghostLapMs = null;
    this.ghostMesh?.setVisible(false);
  }

  /** Pose de un coche con la altura, el cabeceo y el balanceo que da la pista en ese punto. */
  private computePose(world: World, x: number, z: number, heading: number): Pose {
    const q = world.track.query(x, z, this.renderQuery);
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
    world: World,
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
      world,
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
      if (this.particles) {
        this.effects.emit(this.particles, racer, pose, dt, this.playing, this.reducedMotion);
      }
    }
    return pose;
  }

  /**
   * Dibuja un frame: coches, efectos, cámara, fantasma, HUD y minimapa. `alpha` es la interpolación entre
   * pasos. Devuelve false si todavía no hay nada que dibujar.
   */
  draw(
    world: World,
    dt: number,
    alpha: number,
    playing: boolean,
    reducedMotion: boolean,
    fov: number,
  ): boolean {
    const renderer = this.renderer;
    const chase = this.chase;
    if (!renderer || !chase || !this.carMesh || !this.hud || !this.trackScene) return false;
    this.playing = playing;
    this.reducedMotion = reducedMotion;
    const car = world.car;
    const a = alpha;
    const effectsDt = playing ? dt : 0;
    const cam = renderer.camera.position;
    const camX = cam.x;
    const camZ = cam.z;

    this.effects.update(effectsDt);
    const pose = this.drawRacer(world, world.player, this.carMesh, a, effectsDt, camX, camZ);
    const { x, y, z, heading } = pose;
    if (world.teleports !== this.seenTeleports) {
      // Tras reaparecer o reiniciar la cámara se coloca directamente (corte), sin barrido brusco.
      this.seenTeleports = world.teleports;
      chase.snap(x, y, z, heading);
      this.cameraEffects.reset();
    } else {
      chase.update(x, y, z, heading, dt, reducedMotion);
    }
    // Campo de visión con la velocidad y sacudida leve (nada con "Reducir movimiento").
    const playerImpact = this.effects.playerImpact;
    if (playing && playerImpact > EFFECTS.sparkMinImpact) this.cameraEffects.hit(playerImpact);
    this.cameraEffects.update(
      Math.abs(car.forwardSpeed) / world.params.maxSpeed,
      effectsDt,
      reducedMotion,
    );
    renderer.camera.position.add(this.cameraEffects.shake);
    renderer.setFov(fov + this.cameraEffects.fovOffset);
    this.trackScene.environment.followTarget(x, y, z);

    // Rivales.
    this.minimapDots.length = world.racers.length - 1;
    for (let i = 1; i < world.racers.length; i++) {
      const racer = world.racers[i];
      const mesh = this.rivalMeshes[i - 1];
      if (!racer || !mesh) continue;
      const p = this.drawRacer(world, racer, mesh, a, effectsDt, camX, camZ);
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
        const gp = this.computePose(world, g.x, g.z, g.heading);
        this.ghostMesh.update(gp.x, gp.y, gp.z, gp.heading, gp.pitch, gp.roll, 0, 0);
        ghostX = g.x;
        ghostZ = g.z;
      }
    }

    // Indicador de derrape del HUD (también es la señal visual del chirrido).
    const drifting = playing && skidIntensity(car, world.appliedControls) > DRIFT_THRESHOLD;
    this.driftHold = drifting ? DRIFT_HOLD_SECONDS : Math.max(0, this.driftHold - effectsDt);

    this.trackScene.environment.follow(cam.x, cam.y, cam.z);
    this.hud.update(world, car.forwardSpeed, this.ghostDelta(world), this.driftHold > 0);
    this.hud.minimap.draw(car.x, car.z, ghostX, ghostZ, this.minimapDots);
    renderer.render();
    return true;
  }

  /** Diferencia con el fantasma en el mismo punto de la vuelta (ms), o null si no se puede comparar. */
  private ghostDelta(world: World): number | null {
    const race = world.race;
    if (!this.ghostPlayer || race.phase !== 'racing') return null;
    if (race.lapDistance < HUD.ghostDeltaMinDistance) return null;
    const ghostMs = this.ghostPlayer.timeAtDistance(race.lapDistance);
    return ghostMs === null ? null : stepsToMs(race.lapSteps) - ghostMs;
  }
}
