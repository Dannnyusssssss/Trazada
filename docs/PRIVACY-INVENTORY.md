# Inventario de privacidad

Este documento describe qué datos trata Trazada. Se limita a lo que el código hace.

## Qué recoge el juego

Nada. Trazada no recoge datos personales ni de ningún otro tipo: no hay cuentas, formularios, chat,
clasificaciones en línea ni analítica. El juego no envía información a ningún servidor.

## Qué se guarda en el navegador del jugador

Se usa únicamente `localStorage`, en el propio navegador y en el propio dispositivo. Los datos no salen de él.

### Clave `trazada:v1`

- **Ajustes:** silencio, reducir movimiento, campo de visión, calidad gráfica, cámara elegida, volumen, música,
  ayudas de conducción (dirección, frenado y reaparición automática), resolución dinámica, la escala de
  resolución que esta haya dejado y los controles táctiles (aceleración automática, modo zurdo, tamaño y
  opacidad de los botones).
- **Última selección:** circuito, coche, modo de juego y dificultad.
- **Progreso y mejores marcas:** la mejor vuelta por circuito y coche (en milisegundos) y el mejor puesto final
  en el modo Carrera por circuito y dificultad. De los tiempos se derivan las medallas y los circuitos
  desbloqueados.

### Clave `trazada:ghost:<circuito>:v1`

Una por circuito. Contiene el fantasma de la mejor vuelta: la versión del formato, el identificador del
circuito y del coche, el tiempo de la vuelta, la frecuencia de muestreo y la lista de muestras. Cada muestra
es una posición en la pista y un rumbo del coche, codificados como números.

No se guarda ningún dato sobre la persona que juega.

## Lo que no se usa

- Cookies.
- Cuentas, formularios o datos de identificación.
- Analítica, publicidad o seguimiento.
- Peticiones a otros dominios: el juego carga todos sus archivos de su propio origen.

## Terceros

Solo el servicio de alojamiento. Si el juego se sirve desde GitHub Pages, ese servicio puede registrar
direcciones IP y datos técnicos de las visitas según su propia política de privacidad. El juego no tiene
acceso a esos registros.

## Cómo borrar los datos

- Borrar los datos del sitio desde los ajustes del navegador elimina todas las claves anteriores.
- Si el juego se abre dentro de un portal que ofrece un botón de borrar datos, ese botón elimina las claves
  que empiezan por `trazada:`.

## Menores

El juego no recoge datos de ninguna persona, menores incluidos.
