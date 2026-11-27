# Trazada

Carreras arcade en 3D low-poly para el navegador. Encuentra la trazada perfecta en cada curva, bate a tu propio
fantasma en la contrarreloj y gana carreras contra cinco rivales.

![Portada de Trazada](docs/cover.png)

## Cómo se juega

- **Contrarreloj:** 3 vueltas contra el reloj y contra tu fantasma (tu mejor vuelta en ese circuito). El
  fantasma sale desde la segunda vuelta, cuando los dos vais lanzados: en la primera arrancas parado y la
  comparación no sería justa. Según tu tiempo ganas una medalla de bronce, plata u oro, y las medallas abren los
  siguientes circuitos.
- **Carrera:** 3 vueltas contra 5 rivales, con dificultad Fácil, Normal o Difícil. Los rivales usan la misma
  física que tú.
- Cada vuelta solo cuenta si pasas por todos los controles del circuito en orden.
- **Circuitos:** Valle Solar (amanecer, ancho y fluido), Cumbre (ocaso, con desnivel y curvas cerradas) y
  Puerto Neón (noche, urbano y estrecho).
- **Coches:** Gorrión (equilibrado), Vencejo (rápido, gira más despacio) y Zorro (ágil, menos velocidad punta).

## Controles

| Acción | Teclado | Mando | Pantalla táctil |
|---|---|---|---|
| Acelerar | W / ↑ | RT | Automático (o ▲ si se desactiva) |
| Frenar y marcha atrás | S / ↓ | LT | ▼ |
| Girar | A D / ← → | Stick izquierdo o cruceta | ◀ ▶ |
| Freno de mano (derrape) | Espacio | A | FM |
| Reaparecer en el último control | R | Y | ↺ |
| Cambiar de cámara | C | X | CAM |
| Pausa | Esc / P | Start | II |
| Silenciar | M | — | Botón «Sonido» |

Las teclas son las de fábrica: se pueden cambiar en **Ajustes → Controles** (dos teclas por acción). Esc
siempre pausa y Tab siempre saca el foco del juego, así que no se pueden asignar. En la misma pestaña se ajusta
la respuesta de la dirección con teclado (directa, normal o suave) y la zona muerta y la sensibilidad del stick
del mando. Estos ajustes solo cambian cómo se leen los controles: el coche se comporta igual y los récords
siguen contando.

Los menús se manejan con el teclado (flechas, Tab e Intro), con el ratón, tocando la pantalla o con el mando
(cruceta o stick para moverse, A para aceptar, B para volver y LB/RB para cambiar de pestaña en Ajustes).

**Ajustes.** Es una ventana con pestañas: Pantalla, Sonido, Controles, Conducción y Táctil (esta solo con
pantalla táctil). Cada pestaña tiene un botón para volver a sus valores de fábrica.

**Métricas.** F2 (o la casilla «Mostrar métricas» en Ajustes → Pantalla) muestra un panel pequeño con los FPS,
el tiempo de frame, las llamadas de dibujo, los triángulos, la escala de resolución y la calidad gráfica.

**Pantalla táctil.** Los botones aparecen solo en dispositivos táctiles (o tras el primer toque) y solo durante
la carrera: dirección a la izquierda y pedales a la derecha. Se pueden usar varios dedos a la vez. En Ajustes →
«Táctil» se elige la aceleración automática (activada por defecto), el modo zurdo (dirección a la
derecha), el tamaño de los botones (todos de al menos 44 px) y la opacidad del relleno. En vertical, el juego
pide girar el dispositivo y pausa la carrera. En dispositivos táctiles la calidad gráfica empieza en Baja.

## Accesibilidad

- **Reducir movimiento** (en el inicio, en la pausa y en los ajustes) quita la sacudida de cámara, el cambio
  del campo de visión con la velocidad, el humo y las chispas. Viene activada si el sistema operativo tiene
  activada la preferencia de reducir el movimiento.
- Ningún efecto parpadea más de 3 veces por segundo.
- Todo el juego se puede jugar sin sonido: cada aviso sonoro tiene también una señal en pantalla.
- Campo de visión, calidad gráfica, resolución dinámica, volumen general, de la música y de los efectos,
  música, teclas y ayudas de conducción (dirección, frenado y reaparición automática) se pueden ajustar.

## Privacidad

El juego no recoge datos personales ni se conecta a ningún servidor. Solo guarda en el navegador del jugador
(`localStorage`, claves que empiezan por `trazada:`) los ajustes, el progreso, los mejores tiempos y los
fantasmas. Borrar los datos del sitio los elimina.

El detalle de lo que se guarda está en [docs/PRIVACY-INVENTORY.md](docs/PRIVACY-INVENTORY.md).

## Requisitos

Un navegador actual con WebGL activado. Si WebGL no está disponible, el juego lo indica con un mensaje.

## Desarrollo

Necesita Node.js 24 o posterior.

```
npm ci             # instala las dependencias exactas del lockfile
npm run dev        # servidor de desarrollo
npm run build      # comprueba los tipos y genera dist/
npm run preview    # sirve dist/ para probar la versión publicada
npm run test       # tests de la lógica
npm run lint       # análisis estático
```

## Despliegue

`dist/` es un sitio estático con rutas relativas: funciona en cualquier hosting estático y bajo cualquier
subruta.

Con GitHub Pages, el workflow `.github/workflows/deploy.yml` ejecuta lint, tests y build en cada push a `main` y,
si todo pasa, publica `dist/`. Para activarlo, en el repositorio ve a **Settings → Pages** y elige
**Source: GitHub Actions**.

## Licencia

Código, arte procedural, textos y sonido: **Todos los derechos reservados. Titular: Danny Sivinta.** Consulta el
archivo [LICENSE](LICENSE).

Las dependencias de terceros y sus licencias están en [docs/LICENSES.md](docs/LICENSES.md). Three.js (licencia
MIT) se incluye en el código publicado junto con su aviso de licencia.
