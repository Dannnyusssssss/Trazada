import { describe, expect, it } from 'vitest';
import { META, SAVE_KEY } from '../src/data/meta';

describe('meta', () => {
  it('usa el prefijo de guardado declarado para el portal', () => {
    expect(META.storagePrefix).toBe('trazada:');
    expect(SAVE_KEY).toBe('trazada:v1');
    expect(META.slug).toMatch(/^[a-z0-9-]+$/);
  });
});
