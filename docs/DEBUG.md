# Depuración

Parámetros de URL solo para desarrollo. Están ocultos por defecto, no aparecen en la interfaz y, desactivados,
no consumen CPU. Cualquier otro valor o parámetro se ignora.

| Parámetro | Valores aceptados | Efecto |
|---|---|---|
| `?debug` | `?debug`, `?debug=1`, `?debug=true` | Muestra el panel de depuración: FPS, llamadas de dibujo, geometrías y texturas en memoria (para detectar fugas al cambiar de circuito), velocidad, superficie, progreso, distancia lateral, siguiente checkpoint y los parámetros de física del coche editables en vivo. |

## Panel de física

- Cada parámetro del coche tiene un campo numérico. El cambio se aplica al instante al coche del jugador; los rivales del modo Carrera conservan los valores de `src/data/cars.ts`.
- El panel muestra siempre los datos del coche del jugador.
- "Restablecer" vuelve a los valores de `src/data/cars.ts`.
- "Copiar valores" muestra en el panel el objeto con los valores actuales para pegarlo en `src/data/cars.ts`.
- Los cambios no se guardan: al recargar se usan los valores de `src/data/cars.ts`.
