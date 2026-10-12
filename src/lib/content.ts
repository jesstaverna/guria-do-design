// Regras puras do módulo de Planejamento de Conteúdo (testadas em content.test.ts).
import { addDays, pad2 } from '@/lib/domain';

export const STAGES = [
  { key: 'ideia', label: 'Ideia' }, { key: 'roteiro', label: 'Roteiro' }, { key: 'producao', label: 'Em produção' },
  { key: 'revisao', label: 'Em revisão' }, { key: 'aprovado', label: 'Aprovado' }, { key: 'agendado', label: 'Agendado na plataforma' }, { key: 'publicado', label: 'Publicado' },
] as const;
export type StageKey = (typeof STAGES)[number]['key'];
export const STAGE_KEYS = STAGES.map((s) => s.key) as StageKey[];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<StageKey, string>;
/** Etapas que contam como "em produção" nas métricas (do roteiro pronto até agendado; ideia e publicado ficam fora). */
export const IN_PRODUCTION: StageKey[] = ['producao', 'revisao', 'aprovado', 'agendado'];

export const BUCKETS = { calendario: 'Calendário', acervo: 'Acervo reserva', remanejado: 'Remanejados', ideia: 'Ideias' } as const;
export type BucketKey = keyof typeof BUCKETS;
export const PRIORITY_LABEL: Record<string, string> = { baixa: 'Baixa', media: 'Normal', alta: 'Alta', urgente: 'Urgente' };

export interface PostLite {
  id: string; title: string; hook: string | null; format: string; network: string; status: StageKey; bucket: BucketKey; publish_date: string | null;
  pillar_id: string | null; priority: string; assignee_id: string | null; keyword: string | null; category: string | null; review_required: boolean;
  published_at: string | null; cards_count: number; has_caption: boolean; has_prompt: boolean; has_manychat: boolean; manually_edited_at: string | null;
}
export interface PillarLite { id: string; name: string; color: string; position: number; active: boolean; description?: string | null; objective?: string | null }

// ---------- datas (semana começa na SEGUNDA) ----------
/** Matriz de semanas (segunda→domingo) cobrindo o mês; células fora do mês são marcadas. */
export function monthGridMon(year: number, month1: number) {
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const start = addDays(first.toISOString().slice(0, 10), -((first.getUTCDay() + 6) % 7));
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => { const date = addDays(start, w * 7 + d); return { date, inMonth: Number(date.slice(5, 7)) === month1 }; });
    if (w >= 4 && !week.some((x) => x.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}
/** Os 7 dias (segunda→domingo) da semana que contém `date`. */
export function weekDaysMon(date: string) {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(date, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}`;
}
export const isYm = (v: string | undefined | null): v is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(v ?? '');
export const isDate = (v: string | undefined | null): v is string => /^\d{4}-\d{2}-\d{2}$/.test(v ?? '') && !Number.isNaN(Date.parse(v!));

// ---------- filtros ----------
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface PostFilters { pillar?: string; campaign?: string; status?: string; format?: string; q?: string; assignee?: string; month?: string; bucket?: string }

export function filterPosts<T extends PostLite>(posts: T[], f: PostFilters, links: Map<string, string[]>): T[] {
  const q = f.q ? fold(f.q.trim()) : '';
  return posts.filter((p) => {
    if (f.pillar && p.pillar_id !== f.pillar) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.format && p.format !== f.format) return false;
    if (f.assignee && (f.assignee === 'nenhum' ? p.assignee_id : p.assignee_id !== f.assignee)) return false;
    if (f.bucket && p.bucket !== f.bucket) return false;
    if (f.month && !(p.publish_date ?? '').startsWith(f.month)) return false;
    if (f.campaign && !(links.get(p.id) ?? []).includes(f.campaign)) return false;
    if (q && !fold([p.title, p.hook, p.keyword, p.category].filter(Boolean).join(' ')).includes(q)) return false;
    return true;
  });
}

// ---------- estatísticas (somente fatos do banco; sem alcance/conversão inventados) ----------
export function contentStats(posts: PostLite[], pillars: PillarLite[]) {
  const dated = posts.filter((p) => p.bucket === 'calendario' && p.publish_date);
  const published = dated.filter((p) => p.status === 'publicado' && p.published_at);
  const perMonth: Record<string, number> = {};
  dated.forEach((p) => { const k = p.publish_date!.slice(0, 7); perMonth[k] = (perMonth[k] ?? 0) + 1; });
  const byStage = Object.fromEntries(STAGE_KEYS.map((k) => [k, posts.filter((p) => p.status === k).length])) as Record<StageKey, number>;
  const byPillar = pillars.map((pl) => {
    const mine = posts.filter((p) => p.pillar_id === pl.id);
    const d = mine.filter((p) => p.bucket === 'calendario' && p.publish_date);
    return {
      id: pl.id, total: mine.length, withDate: d.length, published: d.filter((p) => p.status === 'publicado').length,
      inProduction: mine.filter((p) => IN_PRODUCTION.includes(p.status)).length, scripted: mine.filter((p) => p.status === 'roteiro').length, ideas: mine.filter((p) => p.status === 'ideia').length,
      share: dated.length ? (d.length / dated.length) * 100 : 0,
    };
  });
  const noPillar = dated.filter((p) => !p.pillar_id).length;
  return {
    planned: dated.length, published: published.length, pending: dated.length - published.length, perMonth, byStage, byPillar, noPillar,
    progress: dated.length ? (published.length / dated.length) * 100 : 0,
    reserve: { acervo: posts.filter((p) => p.bucket === 'acervo').length, remanejado: posts.filter((p) => p.bucket === 'remanejado').length, ideia: posts.filter((p) => p.bucket === 'ideia').length },
    undated: posts.filter((p) => !p.publish_date).length,
  };
}

// ---------- textos para copiar ----------
export interface Card { position: number; role?: string; headline?: string; body?: string; cta?: string | null; visual_direction?: string }
export const CARD_ROLE: Record<string, string> = { capa: 'Capa', desenvolvimento: 'Desenvolvimento', fechamento: 'Fechamento' };

export function cardText(c: Card) {
  return [`CARD ${c.position}${c.role ? ` — ${CARD_ROLE[c.role] ?? c.role}` : ''}`, c.headline, c.body, c.cta ? `CTA: ${c.cta}` : '', c.visual_direction ? `Visual: ${c.visual_direction}` : ''].filter(Boolean).join('\n');
}
export const allCardsText = (cards: Card[]) => cards.map(cardText).join('\n\n');

export interface ManyChat { name?: string; trigger_keyword?: string; status?: string; enabled?: boolean; public_comment_replies?: string[]; dm_messages?: string[]; notes?: string }
export function manychatText(m: ManyChat) {
  return [
    `Fluxo: ${m.name ?? ''}`, `Palavra-chave: ${m.trigger_keyword ?? ''}`, '',
    'RESPOSTAS PÚBLICAS (alternativas — use UMA por pessoa):', ...(m.public_comment_replies ?? []).map((r, i) => `${i + 1}) ${r}`), '',
    'MENSAGENS DE DIRECT (enviar em sequência):', ...(m.dm_messages ?? []).map((r, i) => `${i + 1}) ${r}`),
  ].join('\n');
}

export interface ChecklistItem { label: string; done: boolean }
export const DEFAULT_CHECKLIST: string[] = ['Roteiro revisado', 'Arte criada', 'Legenda revisada', 'Prompt testado', 'ManyChat revisado (rascunho)', 'Aprovado', 'Agendado na plataforma', 'Publicado e link conferido'];
export const defaultChecklist = (): ChecklistItem[] => DEFAULT_CHECKLIST.map((label) => ({ label, done: false }));

/** Validação do que o autosave aceita para cards: sempre 0 (rascunho) ou exatamente 7 cards numerados. */
export function normalizeCards(input: unknown): Card[] | null {
  if (!Array.isArray(input) || (input.length !== 0 && input.length !== 7)) return null;
  return input.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return { position: i + 1, role: typeof o.role === 'string' ? o.role.slice(0, 30) : undefined, headline: s(o.headline, 300), body: s(o.body, 2000), cta: typeof o.cta === 'string' && o.cta.trim() ? o.cta.slice(0, 300) : null, visual_direction: s(o.visual_direction, 1000) };
  });
}
