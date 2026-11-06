/**
 * Metadatos del juego. El título se escribe solo aquí: el resto del código
 * (incluido index.html, mediante el plugin de vite.config.ts) lo lee de esta constante.
 */
export const META = {
  title: 'Trazada',
  slug: 'trazada',
  description: 'Carreras arcade en 3D low-poly: encuentra la trazada perfecta y bate tus tiempos.',
  /** Prefijo de todas las claves de localStorage del juego. */
  storagePrefix: 'trazada:',
  /** Versión del formato de guardado principal. */
  saveVersion: 1,
  copyright: 'Todos los derechos reservados. Titular: Danny Sivinta.',
} as const;

/** Clave principal de guardado: ajustes, progreso y mejores tiempos. */
export const SAVE_KEY = `${META.storagePrefix}v${META.saveVersion}`;
