# Arquitectura de Trazada

Trazada es un juego de carreras arcade en 3D con estilo low-poly que se ejecuta por completo en el navegador. Está escrito en TypeScript estricto, usa Three.js (`WebGLRenderer`) para dibujar y Vite para empaquetar. Hay dos modos: contrarreloj (con fantasma de la mejor vuelta) y carrera contra conductores rivales. No hay servidor: todo es estático y se publica desde `dist/`.

La idea central es separar la simulación, que es lógica pura y determinista, de todo lo que se ve y se oye.

## Mapa de carpetas

| Carpeta | Contenido |
|---|---|
| `src/main.ts`, `src/app.ts` | Arranque y orquestador: pantallas, bucle de frames, pausa, ajustes y conexión de las piezas de `src/app/`. |
| `src/app/` | Piezas del orquestador, cada una con una responsabilidad (ver abajo). |
| `src/core/` | Utilidades sin dependencias del navegador: bucle de paso fijo (`loop.ts`), generador aleatorio con semilla (`rng.ts`), entrada (`input.ts`, `gamepad.ts`, `touch.ts`), teclas configurables (`bindings.ts`), navegación de menús con el mando (`menu-nav.ts`), estadísticas de frame (`frame-stats.ts`), ciclo de pestañas (`cycle.ts`), matemáticas (`math.ts`), resolución dinámica y lectura de la URL. |
| `src/game/` | Lógica de juego: pista, coche, vueltas y checkpoints, fantasma, conductores rivales (`rival-driver.ts`), colisiones, asistencias, escenario y el mundo (`world.ts`) con sus sistemas en `systems/`. |
| `src/data/` | Datos tipados: circuitos, coches, rivales, balance, textos y metadatos. |
| `src/render/` | Todo lo que usa Three.js: escena, mallas de pista, coches y escenario, cámara, partículas, minimapa y HUD. |
| `src/ui/` | Menús y paneles en el DOM: inicio, selección, resultados, pausa y la ventana de ajustes con pestañas (`settings-panel.ts`, `tabs.ts`, `controls-tab.ts`, `form-controls.ts`), el panel de métricas (`metrics-overlay.ts`), la navegación de menús con el mando (`menu-gamepad.ts`) y los botones táctiles (`touch-controls.ts`). |
| `src/audio/` | Lógica pura del sonido (motor, efectos, música y volumen de cada bus). `src/audio/web/` es el único adaptador a WebAudio. |
| `src/save/` | Persistencia en `localStorage` con validación (`storage.ts`, `ghost-storage.ts`). |
| `tests/` | Pruebas de Vitest; `tests/helpers/` contiene el piloto automático. |
| `docs/` | Documentación pública. |

### Módulos de `src/app/`

- `world-factory.ts`: crea el mundo de cada sesión con el circuito ya muestreado y una semilla por carrera.
- `game-input.ts`: combina teclado, mando y pantalla táctil en unos controles únicos por paso de simulación, aplica las teclas configuradas, el suavizado de la dirección con teclado y los ajustes del stick (solo cambian la entrada, no la física), y lee el mando en los menús.
- `race-view.ts`: mantiene las mallas, la cámara y el HUD de la carrera en curso.
- `race-effects.ts`: humo, marcas de derrape y chispas a partir del estado del mundo.
- `race-audio.ts`: prepara en cada frame la mezcla de sonido y se la pasa al motor de sonido.
- `session-recorder.ts`: guarda récords de vuelta, fantasma y datos de resultados.
- `results.ts`: construye los datos de la pantalla de resultados.
- `menus.ts`: monta las pantallas de menú sobre el juego.
- `browser-events.ts`: conecta teclado, desbloqueo del audio, pausa por foco y foco del área de juego.
- `render-scale.ts`: aplica la escala de resolución, incluida la resolución dinámica.

## Capas y por qué

- **Lógica pura** (`core/`, `game/`, `data/` y la parte lógica de `audio/`): no importa `three`, no toca el DOM y no usa `Math.random` ni relojes del sistema. ESLint lo impone con reglas de importación y de globales restringidos. Así la simulación se puede probar sin navegador y produce siempre el mismo resultado ante las mismas entradas.
- **Render** (`render/`): lee el estado del mundo y lo dibuja; no lo modifica.
- **UI** (`ui/`): menús y HUD como elementos HTML creados con `textContent` y nodos, nunca con `innerHTML` sobre datos externos.
- **Audio web** (`audio/web/`): traduce la mezcla calculada por la lógica a nodos de WebAudio.
- **Save** (`save/`): lee y escribe `localStorage`, validando cada campo.

## Flujo de un frame

1. El bucle (`core/loop.ts`) acumula el tiempo real y avanza la lógica en pasos fijos de 60 Hz, sea cual sea la frecuencia del monitor.
2. En cada paso, `World` ejecuta los sistemas de la lista `SYSTEMS` de `src/game/world.ts`, siempre en este orden: cuenta atrás, reaparición, controles, física de coches, colisión entre coches, contacto con la pista, progreso de carrera y grabación del fantasma.
3. Tras los pasos, el render recibe `alpha` (la fracción del siguiente paso ya transcurrida) e interpola entre el estado anterior y el actual para que el movimiento se vea fluido.
4. Se actualizan cámara, partículas y HUD, y se dibuja la escena.
5. `race-audio.ts` calcula la mezcla de sonido del frame y el adaptador de `audio/web/` la aplica.

```
 teclado / mando
       |
       v
  game-input ---> [ paso fijo 60 Hz ]            (lógica pura)
                   World + SYSTEMS
                   countdown -> respawn -> controles -> física
                   -> colisión -> pista -> carrera -> fantasma
                        |
                        | estado anterior + actual + alpha
                        v
        +---------------+---------------+
        |               |               |
     render (Three)   HUD / ui (DOM)   race-audio -> audio/web (WebAudio)

  save/ (localStorage validado) <--> app.ts / session-recorder
```

## Decisiones clave

- **Física 2D propia.** La simulación ocurre en el plano del suelo, en metros. La altura y la inclinación del coche las pone el render a partir de la pista. No se usa un motor de física: el manejo arcade se controla con parámetros de `src/data/`.
- **Determinismo.** Todo el tiempo de juego se mide en pasos fijos y la aleatoriedad (rivales, colocación del escenario) sale de un generador con semilla.
- **Los rivales usan la misma física que el jugador.** Reciben acelerador, freno y dirección calculados desde la pista (`src/game/rival-driver.ts`, `racing-line.ts`), sin ventajas de velocidad.
- **Contenido procedural.** Geometría, texturas (dibujadas en Canvas) y sonidos (síntesis con WebAudio) se generan en código; no hay archivos de modelos, imágenes ni audio.
- **Datos tipados.** Circuitos, coches, balance y textos viven en `src/data/`, sin números sueltos por el código.
- **UI en el DOM.** Menús y HUD son HTML sobre el canvas; el minimapa es un canvas 2D pequeño.
- **Guardado con versión.** El estado se guarda bajo el prefijo `trazada:`, con una clave principal versionada y una clave por fantasma. Al leer se comprueba cada campo y, si algo falta o está dañado, se usan valores por defecto.

## Pruebas

Las pruebas usan Vitest y cubren la lógica pura: física del coche, pista, vueltas y checkpoints, fantasma, rivales, colisiones, asistencias, mando, audio lógico, datos de circuitos y persistencia (incluidos guardados corruptos). El render y el audio real no se prueban. Los tests de recorrido (`tests/race-mode.test.ts`, `tests/world.test.ts`, `tests/cars.test.ts`) usan el piloto automático de `tests/helpers/autopilot.ts` para completar vueltas por cada circuito. El flujo de integración continua (`.github/workflows/deploy.yml`) ejecuta la auditoría de dependencias, una comprobación de claves expuestas, lint, pruebas y build antes de publicar.

## Cómo se extiende

- **Un circuito nuevo:** se añade como dato en `src/data/tracks.ts` (curva cerrada, ancho, paleta, checkpoints y tiempos objetivo). Las pruebas de datos comprueban que la curva sea válida y el circuito completable.
- **Un coche nuevo:** se añade en `src/data/cars.ts` con sus estadísticas.
- **Un sistema nuevo:** se escribe en `src/game/systems/` como función que recibe el mundo, la entrada y el paso, y se inserta en `SYSTEMS` de `src/game/world.ts` en el lugar que le corresponda; el orden de esa lista es el orden de ejecución.

## Seguridad, a alto nivel

El juego es totalmente estático y solo carga archivos de su propio origen. El build añade una política de seguridad de contenido (`vite.config.ts`). Lo que se lee de `localStorage` y de la URL se valida antes de usarse. El juego no tiene cuentas, formularios ni analítica y no recoge datos personales; solo guarda en el navegador ajustes, progreso, mejores tiempos y fantasmas.

## Límites conocidos

- La física es arcade y en 2D: no simula suspensión, vuelcos ni daños.
- No hay multijugador ni clasificaciones en línea.
- El comportamiento en distintos navegadores, dispositivos y mandos depende de lo que cada uno soporte de WebGL y WebAudio.
