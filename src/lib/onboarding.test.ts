import { describe, expect, it } from 'vitest';
import { chainDates, progressPct, suggestTemplate } from './onboarding';

const T = [
  { id: 'iv', name: 'Identidade visual', keywords: 'identidade,logo,marca,branding' },
  { id: 'sm', name: 'Social media', keywords: 'social,instagram,conteúdo,posts' },
  { id: 'lp', name: 'Site / Landing page', keywords: 'site,landing,página,web' },
];
describe('suggestTemplate', () => {
  it('escolhe pelo título e itens, sem diferenciar acento ou caixa', () => {
    expect(suggestTemplate('Projeto de Identidade Visual — Logo e manual da marca', T)).toBe('iv');
    expect(suggestTemplate('Gestão de Instagram e conteudo mensal', T)).toBe('sm');
    expect(suggestTemplate('Landing page de captação', T)).toBe('lp');
  });
  it('sem correspondência devolve nulo', () => { expect(suggestTemplate('Consultoria avulsa', T)).toBeNull(); });
});
describe('chainDates / progressPct', () => {
  it('soma a duração de cada etapa a partir do início', () => {
    expect(chainDates('2026-11-02', [{ duration_days: 3 }, { duration_days: 2 }, { duration_days: 0 }])).toEqual(['2026-11-05', '2026-11-07', '2026-11-07']);
    expect(chainDates('2026-12-30', [{ duration_days: 5 }])).toEqual(['2027-01-04']);
  });
  it('progresso', () => { expect(progressPct(3, 8)).toBe(38); expect(progressPct(0, 0)).toBe(0); });
});
