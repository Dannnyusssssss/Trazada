import { clamp, vec2, wrapAngle } from '../../src/core/math';
import type { CarControls } from '../../src/core/input';
import type { World } from '../../src/game/world';

const target = vec2();
const tangent = vec2();

/**
 * Piloto automático sencillo para los tests: apunta a un punto de la línea central por delante
 * y ajusta la velocidad según la curvatura que viene.
 */
export function autopilot(world: World, out: CarControls, lateralAccel = 11): CarControls {
  const car = world.car;
  const track = world.track;
  const speed = Math.max(0, car.forwardSpeed);
  const progress = world.query.progress;
  track.pointAt(progress + 10 + speed * 0.35, target, tangent);
  const desired = Math.atan2(-(target.z - car.z), target.x - car.x);
  const error = wrapAngle(desired - car.heading);
  let maxCurvature = 1e-4;
  for (let d = 0; d < 90; d += 3) {
    const i = track.indexAt(progress + d);
    maxCurvature = Math.max(maxCurvature, Math.abs(track.curvature[i] ?? 0));
  }
  const targetSpeed = Math.min(42, Math.sqrt(lateralAccel / maxCurvature));
  out.steer = clamp(error * 2.5, -1, 1);
  out.throttle = speed < targetSpeed ? 1 : 0;
  out.brake = speed > targetSpeed + 3 ? 1 : 0;
  out.handbrake = false;
  return out;
}
