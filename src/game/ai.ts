import type { CarControls } from '../core/input';
import { clamp, moveToward, wrapAngle } from '../core/math';
import type { Rng } from '../core/rng';
import { AI, type AiLevel } from '../data/balance';
import { raceDistance, type Racer } from './racer';
import {
  lateralAccelForLapTime,
  racingLineFor,
  speedProfile,
  type RacingLine,
} from './racing-line';
import { progressDelta, type Track } from './track';

/** Lo que el conductor necesita saber del resto de la carrera. */
export interface AiContext {
  readonly track: Track;
  readonly racers: readonly Racer[];
  /** El coche del jugador (referencia de la ayuda limitada), o null si no hay. */
  readonly player: Racer | null;
}

/**
 * Conductor de un rival. Calcula acelerador, freno y dirección a partir de la línea de carrera y de una
 * velocidad objetivo que depende de la curvatura; luego el coche se mueve con la misma física que el
 * del jugador (no hay atajos de velocidad ni de agarre).
 * Cada rival tiene pequeñas diferencias fijadas por la semilla: un desplazamiento propio sobre la línea
 * y algo más o menos de agresividad en las curvas.
 */
export class AiDriver {
  private readonly line: RacingLine;
  /** Velocidad objetivo por muestra con la agresividad base de este rival (m/s). */
  readonly profile: Float64Array;
  /** Desplazamiento lateral propio respecto a la línea (m). */
  readonly bias: number;
  /** Desplazamiento lateral actual para adelantar o esquivar (m). */
  private avoid = 0;
  /** Aceleración lateral con la que se calculó el perfil (m/s²). */
  readonly lateralAccel: number;
  /** Último ajuste de la ayuda limitada (para depuración y tests). */
  rubberBand = 1;

  constructor(track: Track, racer: Racer, level: AiLevel, rng: Rng) {
    this.line = racingLineFor(track);
    // Ritmo de este rival: el de la dificultad con una pequeña variación propia.
    const skill = 1 + rng.range(-level.spread, level.spread);
    this.bias = rng.range(-AI.lineBias, AI.lineBias);
    const medals = track.def.medals;
    const paceMs =
      medals.gold * level.pace.gold +
      medals.silver * level.pace.silver +
      medals.bronze * level.pace.bronze;
    const brake = racer.params.brakeDecel * level.brakeUse;
    this.lateralAccel = lateralAccelForLapTime(
      this.line,
      racer.params,
      brake,
      (paceMs / 1000 / AI.paceCorrection) * skill,
    );
    this.profile = speedProfile(this.line, racer.params, this.lateralAccel, brake);
  }

  /** Vuelve al estado inicial (al reiniciar la carrera). */
  reset(): void {
    this.avoid = 0;
    this.rubberBand = 1;
  }

  /** Ajuste de la ayuda limitada: algo más al límite si va muy por detrás del jugador, algo menos si se escapa. */
  private rubberBandFactor(ctx: AiContext, racer: Racer): number {
    const player = ctx.player;
    if (!player || player === racer || player.race.phase === 'finished') return 1;
    const length = ctx.track.length;
    const gap = raceDistance(player, length) - raceDistance(racer, length);
    return 1 + clamp(gap / AI.rubberBandGap, -1, 1) * AI.rubberBand;
  }

  /** Velocidad objetivo en un progreso dado (m/s), interpolando el perfil. */
  targetSpeedAt(progress: number): number {
    const i = this.line.track.indexAt(progress);
    return this.profile[i] ?? 0;
  }

  drive(ctx: AiContext, racer: Racer, out: CarControls, dt: number): CarControls {
    const track = ctx.track;
    const car = racer.car;
    const q = racer.query;
    const speed = Math.max(0, car.forwardSpeed);
    const progress = q.progress;

    // Velocidad objetivo: la del perfil un poco por delante (anticipa la frenada), con la ayuda limitada.
    // v crece con la raíz de la aceleración lateral, así que el ajuste se aplica con su raíz.
    this.rubberBand = this.rubberBandFactor(ctx, racer);
    const scale = Math.sqrt(this.rubberBand);
    let target =
      Math.min(
        this.targetSpeedAt(progress),
        this.targetSpeedAt(progress + speed * AI.speedPreview),
      ) * scale;

    // Tráfico. Límite lateral para el centro del coche: dentro del asfalto con margen.
    const limit = track.halfWidth - AI.edgeMargin;
    const lineOffset = this.line.offsetAt(progress) + this.bias;
    const myLateral = q.lateral;
    let minLateral = -limit;
    let maxLateral = limit;
    let blocker: Racer | null = null;
    let blockerAhead = Infinity;
    for (const other of ctx.racers) {
      if (other === racer) continue;
      const ahead = progressDelta(progress, other.query.progress, track.length);
      const otherLateral = other.query.lateral;
      if (Math.abs(ahead) <= AI.alongside) {
        // Coche al lado: no meterse en su carril (si no, los dos se empujan y se frenan).
        const gap = otherLateral - myLateral;
        if (Math.abs(gap) < AI.sideGap + 0.6) {
          if (gap > 0) maxLateral = Math.min(maxLateral, otherLateral - AI.sideGap);
          else minLateral = Math.max(minLateral, otherLateral + AI.sideGap);
        }
        continue;
      }
      // Coche delante en la misma trayectoria y más lento: candidato a adelantar (el más cercano).
      if (ahead <= 0 || ahead > AI.avoidDistance || ahead >= blockerAhead) continue;
      if (Math.abs(otherLateral - (lineOffset + this.avoid)) > AI.avoidWidth) continue;
      if (speed < other.car.forwardSpeed - 0.5) continue;
      blocker = other;
      blockerAhead = ahead;
    }
    if (minLateral > maxLateral) {
      // Encajonado entre dos coches: ir por el medio del hueco.
      const middle = (minLateral + maxLateral) / 2;
      minLateral = middle;
      maxLateral = middle;
    }

    // Adelantar: apartarse hacia el lado libre del coche de delante; si no hay hueco, igualar su
    // velocidad en lugar de empujarlo.
    let desiredAvoid = 0;
    if (blocker) {
      const otherLateral = blocker.query.lateral;
      const preferLeft = otherLateral - (lineOffset + this.avoid) < 0;
      const left = otherLateral + AI.avoidShift;
      const right = otherLateral - AI.avoidShift;
      const leftFits = left <= maxLateral;
      const rightFits = right >= minLateral;
      let wanted: number | null = null;
      if (preferLeft && leftFits) wanted = left;
      else if (!preferLeft && rightFits) wanted = right;
      else if (leftFits) wanted = left;
      else if (rightFits) wanted = right;
      if (wanted === null) {
        target = Math.min(target, Math.max(0, blocker.car.forwardSpeed));
      } else {
        desiredAvoid = wanted - lineOffset;
        // Mientras no haya completado la maniobra, no se le echa encima.
        if (Math.abs(this.avoid - desiredAvoid) > 0.8) {
          target = Math.min(target, Math.max(blocker.car.forwardSpeed + 1, 8));
        }
      }
    }
    this.avoid = moveToward(this.avoid, desiredAvoid, AI.avoidRate * dt);

    // Dirección: apuntar a un punto de la línea por delante (persecución pura), respetando el hueco libre.
    const lookAhead = AI.lookAhead + speed * AI.lookAheadPerSpeed;
    const aheadProgress = progress + lookAhead;
    const i = track.indexAt(aheadProgress);
    const offset = clamp(
      this.line.offsetAt(aheadProgress) + this.bias + this.avoid,
      minLateral,
      maxLateral,
    );
    const nx = track.tz[i] ?? 0;
    const nz = -(track.tx[i] ?? 1);
    const tx = track.x(i) + nx * offset;
    const tz = track.z(i) + nz * offset;
    const desired = Math.atan2(-(tz - car.z), tx - car.x);
    const error = wrapAngle(desired - car.heading);
    out.steer = clamp(error * AI.steerGain, -1, 1);

    // Acelerador y freno según la diferencia con la velocidad objetivo.
    const diff = target - speed;
    out.throttle = diff > 0 ? clamp(diff / 1.5 + 0.4, 0, 1) : 0;
    out.brake = diff < -AI.brakeMargin ? clamp((-diff - AI.brakeMargin) / 3 + 0.3, 0, 1) : 0;
    out.handbrake = false;
    return out;
  }
}
