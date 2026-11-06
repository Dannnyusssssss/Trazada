# Licencias

## Juego

Código, arte procedural, textos y sonido de Trazada: **Todos los derechos reservados. Titular: Danny Sivinta.**

El juego no usa recursos externos: la geometría se genera por código, las texturas se dibujan con Canvas y el
sonido (a partir del Hito 3) se sintetiza con WebAudio. El favicon se genera por código.

## Dependencias de ejecución (se empaquetan en `dist/`)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| three | 0.187.0 | MIT | Render 3D (WebGL) |

El aviso de licencia MIT de Three.js (Copyright © 2010-2026 three.js authors) se conserva en el código empaquetado.

## Dependencias de desarrollo (no se publican)

| Paquete | Versión | Licencia | Uso |
|---|---|---|---|
| vite | 8.3.6 | MIT | Servidor de desarrollo y empaquetado |
| typescript | 6.0.3 | Apache-2.0 | Comprobación de tipos |
| vitest | 5.1.0 | MIT | Tests de la lógica |
| eslint | 10.14.0 | MIT | Análisis estático |
| @eslint/js | 10.0.1 | MIT | Reglas recomendadas de ESLint |
| typescript-eslint | 8.72.1 | MIT | Soporte de TypeScript en ESLint |
| prettier | 3.9.10 | MIT | Formato del código |
| @types/three | 0.187.0 | MIT | Tipos de Three.js |

Las dependencias transitivas se instalan desde `package-lock.json`.
