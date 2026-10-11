import { describe, expect, it } from 'vitest';
import { brandVars, contrast, parseHex } from './brand-color';

describe('cor da marca', () => {
  it('interpreta #RRGGBB e rejeita inválidos', () => {
    expect(parseHex('#dd00dd')).toEqual([221, 0, 221]);
    expect(parseHex('dd00dd')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
  });
  it('texto sobre a cor: branco em cores escuras, escuro em cores claras', () => {
    expect(brandVars('#7327ea')['--on-accent']).toBe('255 255 255');
    expect(brandVars('#ffd400')['--on-accent']).toBe('16 16 16');
    expect(brandVars('#ffffff')['--on-accent']).toBe('16 16 16');
  });
  it('cor clara ganha versão escurecida legível como texto', () => {
    const v = brandVars('#ffd400');
    const ink = v['--accent-ink'].split(' ').map(Number) as [number, number, number];
    expect(contrast(ink, [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    expect(brandVars('#7327ea')['--accent-ink']).toBe('115 39 234');
  });
  it('sem cor válida usa o padrão do produto', () => {
    expect(brandVars(null)['--accent']).toBe('221 0 221');
    expect(brandVars('xyz')['--accent']).toBe('221 0 221');
  });
});
