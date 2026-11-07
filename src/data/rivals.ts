/**
 * Rivales del modo Carrera: qué coche lleva cada uno y su color de carrocería. Se identifican por el
 * nombre del coche y el color (por ejemplo, «Zorro verde»); no hay pilotos con nombre propio.
 * El orden es el de la parrilla, desde la primera posición.
 */

export interface RivalDef {
  carId: string;
  bodyColor: number;
  colorName: string;
}

export const RIVALS: readonly RivalDef[] = [
  { carId: 'vencejo', bodyColor: 0x47b85a, colorName: 'verde' },
  { carId: 'zorro', bodyColor: 0x8e5bd6, colorName: 'violeta' },
  { carId: 'gorrion', bodyColor: 0x2fc4b2, colorName: 'turquesa' },
  { carId: 'vencejo', bodyColor: 0xe9e4d8, colorName: 'blanco' },
  { carId: 'zorro', bodyColor: 0xf2d23a, colorName: 'amarillo' },
];
