import { describe, expect, it } from 'vitest';
import { allCardsText, contentStats, filterPosts, manychatText, monthGridMon, normalizeCards, shiftMonth, weekDaysMon, type PillarLite, type PostLite } from './content';

const P = (o: Partial<PostLite>): PostLite => ({ id: 'x', title: 'T', hook: null, format: 'carrossel', network: 'instagram', status: 'roteiro', bucket: 'calendario', publish_date: '2026-10-09', pillar_id: 'p1', priority: 'media', assignee_id: null, keyword: null, category: null, review_required: false, published_at: null, cards_count: 7, has_caption: true, has_prompt: true, has_manychat: true, manually_edited_at: null, ...o });
const PIL: PillarLite[] = [{ id: 'p1', name: 'A', color: '#000000', position: 1, active: true }, { id: 'p2', name: 'B', color: '#111111', position: 2, active: true }];

describe('calendário (semana começa na segunda)', () => {
  it('outubro/2026: 1º de outubro é quinta; grade começa na segunda 28/09', () => {
    const g = monthGridMon(2026, 10);
    expect(g[0][0].date).toBe('2026-09-28');
    expect(g[0][3]).toEqual({ date: '2026-10-01', inMonth: true });
    expect(g.every((w) => w.length === 7)).toBe(true);
    expect(g.flat().filter((c) => c.inMonth)).toHaveLength(31);
    expect(new Date(`${g[0][0].date}T00:00:00Z`).getUTCDay()).toBe(1);
  });
  it('semana de uma data vai de segunda a domingo', () => {
    expect(weekDaysMon('2026-10-11')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(weekDaysMon('2026-12-07')[0]).toBe('2026-12-07');
  });
  it('navega entre meses atravessando o ano', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('filtros', () => {
  const posts = [P({ id: 'a', title: 'Guerreiras do K-Pop', keyword: 'KPOP' }), P({ id: 'b', title: 'Natal criativo', pillar_id: 'p2', status: 'ideia', publish_date: '2026-12-07', format: 'reels' })];
  const links = new Map([['a', ['c1']], ['b', ['c2']]]);
  it('combina pilar, status, formato, campanha e mês', () => {
    expect(filterPosts(posts, { pillar: 'p2' }, links).map((p) => p.id)).toEqual(['b']);
    expect(filterPosts(posts, { status: 'ideia' }, links)).toHaveLength(1);
    expect(filterPosts(posts, { format: 'reels' }, links)).toHaveLength(1);
    expect(filterPosts(posts, { campaign: 'c1' }, links).map((p) => p.id)).toEqual(['a']);
    expect(filterPosts(posts, { month: '2026-12' }, links).map((p) => p.id)).toEqual(['b']);
  });
  it('busca por palavra-chave ignora acento e caixa', () => {
    expect(filterPosts(posts, { q: 'natal' }, links)).toHaveLength(1);
    expect(filterPosts(posts, { q: 'kpop' }, links)).toHaveLength(1);
    expect(filterPosts(posts, { q: 'GUERREIRAS' }, links)).toHaveLength(1);
    expect(filterPosts(posts, { q: 'inexistente' }, links)).toHaveLength(0);
  });
});

describe('estatísticas verificáveis', () => {
  it('conta planejado, publicado confirmado, pendente, por mês, etapa e pilar; acervo fica de fora do planejado', () => {
    const posts = [
      P({ id: '1' }), P({ id: '2', publish_date: '2026-11-02', status: 'publicado', published_at: '2026-11-02T12:00:00Z' }), P({ id: '3', publish_date: '2026-11-03', pillar_id: 'p2', status: 'producao' }),
      P({ id: '4', bucket: 'acervo', publish_date: null, status: 'ideia' }), P({ id: '5', bucket: 'ideia', publish_date: null, status: 'ideia', pillar_id: 'p2' }),
      P({ id: '6', bucket: 'remanejado', publish_date: null, status: 'roteiro' }),
    ];
    const s = contentStats(posts, PIL);
    expect(s.planned).toBe(3); expect(s.published).toBe(1); expect(s.pending).toBe(2);
    expect(s.perMonth).toEqual({ '2026-10': 1, '2026-11': 2 });
    expect(s.byStage.ideia).toBe(2); expect(s.byStage.roteiro).toBe(2); expect(s.byStage.producao).toBe(1); expect(s.byStage.publicado).toBe(1);
    expect(s.reserve).toEqual({ acervo: 1, remanejado: 1, ideia: 1 });
    expect(s.byPillar.find((x) => x.id === 'p1')).toMatchObject({ total: 4, withDate: 2, published: 1 });
    expect(s.byPillar.find((x) => x.id === 'p2')).toMatchObject({ total: 2, withDate: 1, inProduction: 1 });
    expect(Math.round(s.progress)).toBe(33);
  });
  it('publicado sem data real de publicação não conta como publicado', () => {
    expect(contentStats([P({ status: 'publicado', published_at: null })], PIL).published).toBe(0);
  });
});

describe('textos para copiar e cards', () => {
  it('formata cards e ManyChat com as 3 alternativas numeradas', () => {
    const t = allCardsText([{ position: 1, role: 'capa', headline: 'Título', body: 'Corpo', cta: 'Arraste →', visual_direction: 'V' }, { position: 2, headline: 'Dois', body: 'x' }]);
    expect(t).toContain('CARD 1 — Capa'); expect(t).toContain('CTA: Arraste →'); expect(t).toContain('CARD 2');
    const m = manychatText({ name: 'F', trigger_keyword: 'KPOP', public_comment_replies: ['a', 'b', 'c'], dm_messages: ['1', '2', '3'] });
    expect(m).toContain('use UMA por pessoa'); expect(m).toContain('3) c'); expect(m).toContain('Palavra-chave: KPOP');
  });
  it('autosave de cards aceita 0 ou exatamente 7 e renumera', () => {
    expect(normalizeCards([])).toEqual([]);
    expect(normalizeCards(Array.from({ length: 6 }, () => ({})))).toBeNull();
    const ok = normalizeCards(Array.from({ length: 7 }, (_, i) => ({ headline: `h${i}`, cta: i === 0 ? 'x' : '' })));
    expect(ok).toHaveLength(7); expect(ok![6].position).toBe(7); expect(ok![1].cta).toBeNull();
    expect(normalizeCards('x')).toBeNull();
  });
});
