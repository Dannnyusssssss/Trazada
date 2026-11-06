import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Texture } from 'three';
import { describe, expect, it } from 'vitest';
import { disposeObject } from '../src/render/dispose';

describe('disposeObject', () => {
  it('libera geometrías, materiales y texturas de todo el árbol (una vez cada uno)', () => {
    const disposed: string[] = [];
    const track = (
      name: string,
      obj: { addEventListener: (t: 'dispose', f: () => void) => void },
    ) => obj.addEventListener('dispose', () => disposed.push(name));
    const texture = new Texture();
    const shared = new MeshLambertMaterial({ map: texture, emissiveMap: texture });
    const g1 = new BoxGeometry();
    const g2 = new BoxGeometry();
    track('g1', g1);
    track('g2', g2);
    track('material', shared);
    track('texture', texture);
    const root = new Group();
    const child = new Group();
    child.add(new Mesh(g2, shared));
    root.add(new Mesh(g1, shared), child);
    disposeObject(root);
    expect(disposed.filter((d) => d === 'g1')).toHaveLength(1);
    expect(disposed.filter((d) => d === 'g2')).toHaveLength(1);
    expect(disposed.filter((d) => d === 'material')).toHaveLength(1);
    expect(disposed).toContain('texture');
  });
});
