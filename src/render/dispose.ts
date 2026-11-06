import { Mesh, type Material, type Object3D, type Texture } from 'three';

/** Libera geometrías, materiales y texturas de un árbol de objetos (al cambiar de circuito o de coche). */
export function disposeObject(root: Object3D): void {
  const materials = new Set<Material>();
  root.traverse((obj) => {
    if (obj instanceof Mesh) {
      obj.geometry.dispose();
      const m: Material | Material[] = obj.material;
      if (Array.isArray(m)) m.forEach((x) => materials.add(x));
      else materials.add(m);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value !== null && typeof value === 'object' && (value as Texture).isTexture) {
        (value as Texture).dispose();
      }
    }
    material.dispose();
  }
}
