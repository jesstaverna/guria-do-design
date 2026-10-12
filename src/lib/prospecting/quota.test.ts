import { describe, expect, it } from 'vitest';
import { monthStartBRT, searchesLeft } from './quota';

describe('cota de buscas', () => {
  it('mês começa à meia-noite de Brasília', () => {
    expect(monthStartBRT(new Date('2026-10-12T15:00:00Z'))).toBe('2026-10-01T03:00:00.000Z');
    expect(monthStartBRT(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10-01T03:00:00.000Z');   // 31/10 22h em Brasília
  });
  it('calcula o que resta e trata ilimitado', () => {
    expect(searchesLeft(5, 2)).toBe(3); expect(searchesLeft(5, 9)).toBe(0); expect(searchesLeft(null, 99)).toBe(Infinity);
  });
});
