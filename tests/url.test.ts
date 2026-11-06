import { describe, expect, it } from 'vitest';
import { parseDebugFlag } from '../src/core/url';

describe('parseDebugFlag', () => {
  it('acepta solo las formas documentadas', () => {
    expect(parseDebugFlag('?debug')).toBe(true);
    expect(parseDebugFlag('?debug=1')).toBe(true);
    expect(parseDebugFlag('?debug=true')).toBe(true);
  });

  it('ignora valores inválidos, repetidos o ausentes', () => {
    expect(parseDebugFlag('')).toBe(false);
    expect(parseDebugFlag('?debug=0')).toBe(false);
    expect(parseDebugFlag('?debug=<script>')).toBe(false);
    expect(parseDebugFlag('?debug=1&debug=1')).toBe(false);
    expect(parseDebugFlag('?track=x')).toBe(false);
    expect(parseDebugFlag(`?debug=1&x=${'a'.repeat(600)}`)).toBe(false);
  });
});
