/**
 * Lectura validada de los parámetros de depuración de la URL. Cualquier valor no reconocido se ignora.
 */

const ACCEPTED_DEBUG_VALUES = new Set(['', '1', 'true']);

/** true solo con `?debug`, `?debug=1` o `?debug=true`. */
export function parseDebugFlag(search: string): boolean {
  if (search.length > 512) return false;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return false;
  }
  const values = params.getAll('debug');
  return values.length === 1 && ACCEPTED_DEBUG_VALUES.has(values[0] ?? 'x');
}
