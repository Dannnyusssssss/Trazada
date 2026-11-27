/**
 * Navegación circular por una lista con elementos que pueden estar deshabilitados.
 * Lógica pura, sin DOM.
 */

/** Primer (o último) índice habilitado; -1 si no hay ninguno. */
export function edgeIndex(
  fromEnd: boolean,
  count: number,
  enabled: (i: number) => boolean,
): number {
  if (fromEnd) {
    for (let i = count - 1; i >= 0; i--) if (enabled(i)) return i;
  } else {
    for (let i = 0; i < count; i++) if (enabled(i)) return i;
  }
  return -1;
}

/**
 * Avanza `delta` posiciones en círculo saltando los índices no habilitados.
 * Si ninguno está habilitado devuelve `current`. Si `current` está fuera de rango,
 * empieza desde el borde correspondiente a la dirección.
 */
export function cycleIndex(
  current: number,
  delta: number,
  count: number,
  enabled: (i: number) => boolean,
): number {
  if (count <= 0) return current;
  const step = delta < 0 ? -1 : 1;
  const outOfRange = !Number.isInteger(current) || current < 0 || current >= count;
  if (outOfRange) {
    const edge = edgeIndex(step < 0, count, enabled);
    return edge < 0 ? current : edge;
  }
  let index = current;
  for (let n = 0; n < count; n++) {
    index = (index + step + count) % count;
    if (enabled(index)) return index;
  }
  return current;
}
