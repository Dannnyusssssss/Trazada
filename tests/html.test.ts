import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/core/html';

describe('escapeHtml', () => {
  it('escapa los caracteres que rompen el HTML o un atributo', () => {
    expect(escapeHtml('a & b <script>"x"</script>')).toBe(
      'a &amp; b &lt;script&gt;&quot;x&quot;&lt;/script&gt;',
    );
  });

  it('deja igual un texto normal', () => {
    expect(escapeHtml('Carreras arcade 3D')).toBe('Carreras arcade 3D');
  });
});
