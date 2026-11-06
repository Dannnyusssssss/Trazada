import type { Group, Scene } from 'three';
import { RENDER, type QualityPreset } from '../data/balance';
import { placeScenery } from '../game/scenery';
import type { Track } from '../game/track';
import { disposeObject } from './dispose';
import { Environment } from './environment';
import { buildSceneryMesh } from './scenery-mesh';
import { buildTerrainMesh } from './terrain-mesh';
import { buildTrackMesh } from './track-mesh';

/**
 * Todo lo que se dibuja de un circuito: terreno, pista, escenario, cielo, luces y niebla.
 * `dispose` lo quita de la escena y libera geometrías, materiales y texturas.
 */
export class TrackScene {
  readonly environment: Environment;
  private readonly groups: Group[];

  constructor(
    private readonly scene: Scene,
    track: Track,
    quality: QualityPreset,
  ) {
    const def = track.def;
    this.groups = [
      buildTerrainMesh(track, quality.anisotropy),
      buildTrackMesh(track, quality.anisotropy),
      buildSceneryMesh(
        placeScenery(track),
        def.palette,
        def.seed,
        quality.sceneryDensity,
        quality.shadows,
      ),
    ];
    for (const group of this.groups) scene.add(group);
    this.environment = new Environment(
      scene,
      def.palette,
      quality.shadows ? quality.shadowMapSize : 0,
      RENDER.shadowArea,
    );
  }

  dispose(): void {
    for (const group of this.groups) {
      this.scene.remove(group);
      disposeObject(group);
    }
    this.environment.detach();
    disposeObject(this.environment.group);
  }
}
