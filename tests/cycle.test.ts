import { describe, expect, it } from 'vitest';
import { cycleIndex, edgeIndex } from '../src/core/cycle';

const all = (): boolean => true;
const none = (): boolean => false;

describe('cycleIndex', () => {
  it('avanza y vuelve al principio en círculo', () => {
    expect(cycleIndex(0, 1, 3, all)).toBe(1);
    expect(cycleIndex(2, 1, 3, all)).toBe(0);
  });

  it('retrocede con delta negativo y da la vuelta', () => {
    expect(cycleIndex(1, -1, 3, all)).toBe(0);
    expect(cycleIndex(0, -1, 3, all)).toBe(2);
  });

  it('salta los índices deshabilitados', () => {
    const enabled = (i: number): boolean => i !== 1;
    expect(cycleIndex(0, 1, 3, enabled)).toBe(2);
    expect(cycleIndex(2, -1, 3, enabled)).toBe(0);
    expect(cycleIndex(2, 1, 3, enabled)).toBe(0);
  });

  it('devuelve el actual si no hay ninguno habilitado', () => {
    expect(cycleIndex(1, 1, 3, none)).toBe(1);
    expect(cycleIndex(-1, 1, 3, none)).toBe(-1);
  });

  it('con count 0 devuelve el actual', () => {
    expect(cycleIndex(0, 1, 0, all)).toBe(0);
  });

  it('si solo el actual está habilitado se queda donde está', () => {
    expect(cycleIndex(1, 1, 3, (i) => i === 1)).toBe(1);
  });

  it('fuera de rango empieza desde el borde de la dirección', () => {
    expect(cycleIndex(-1, 1, 3, all)).toBe(0);
    expect(cycleIndex(5, -1, 3, all)).toBe(2);
    expect(cycleIndex(9, 1, 3, (i) => i !== 0)).toBe(1);
  });
});

describe('edgeIndex', () => {
  it('devuelve el primer y el último habilitado', () => {
    const enabled = (i: number): boolean => i === 1 || i === 2;
    expect(edgeIndex(false, 4, enabled)).toBe(1);
    expect(edgeIndex(true, 4, enabled)).toBe(2);
  });

  it('devuelve -1 si no hay ninguno o count es 0', () => {
    expect(edgeIndex(false, 3, none)).toBe(-1);
    expect(edgeIndex(true, 0, all)).toBe(-1);
  });
});
