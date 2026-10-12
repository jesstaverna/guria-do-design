// Regras puras de negócio (testadas em domain.test.ts). O banco continua sendo a autoridade; aqui ficam prévias e cálculos de tela.

/** "1.234,56" | "1234,56" | "1234.56" | "R$ 10" -> centavos. Retorna null se vazio/inválido. */
export function parseCents(input: string | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).replace(/R\$|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export interface ItemInput { billing: 'pontual' | 'mensal'; quantity: number; unit_price_cents: number }

/** Mesma conta do trigger da proposta: total = pontual + mensal × vigência − desconto. */
export function proposalTotals(items: ItemInput[], contractMonths: number, discountCents = 0) {
  const line = (i: ItemInput) => Math.round(i.quantity * i.unit_price_cents);
  const oneTime = items.filter((i) => i.billing === 'pontual').reduce((s, i) => s + line(i), 0);
  const monthly = items.filter((i) => i.billing === 'mensal').reduce((s, i) => s + line(i), 0);
  return { oneTime, monthly, total: Math.max(oneTime + monthly * contractMonths - discountCents, 0) };
}

/** Parcelas em centavos; o resto vai para a última (igual a activate_proposal). */
export function splitInstallments(totalCents: number, n: number): number[] {
  const each = Math.floor(totalCents / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? totalCents - each * (n - 1) : each));
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function monthRange(year: number, month1: number) {
  const last = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return { from: `${year}-${pad2(month1)}-01`, to: `${year}-${pad2(month1)}-${pad2(last)}` };
}

/** Data de hoje (yyyy-mm-dd) em America/Sao_Paulo. */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function addMonths(date: string, months: number) {
  const [y, m] = date.split('-').map(Number);
  const t = y * 12 + (m - 1) + months;
  return `${Math.floor(t / 12)}-${pad2((t % 12) + 1)}-01`;
}

/** Fração (0..1) do período decorrida em `today`, inclusive. */
export function elapsedFraction(from: string, to: string, today: string) {
  const f = Date.parse(from), t = Date.parse(to) + 86_400_000, n = Date.parse(today) + 86_400_000;
  return Math.min(Math.max((n - f) / (t - f), 0), 1);
}

export interface GoalInput { target: number; actual: number; from: string; to: string; today: string }

/** Progresso da meta + projeção linear (ritmo atual). Em risco = projeção abaixo da meta E realizado < 80% do esperado até hoje. */
export function goalProgress({ target, actual, from, to, today }: GoalInput) {
  const frac = elapsedFraction(from, to, today);
  const percent = target > 0 ? (actual / target) * 100 : 0;
  const expected = target * frac;
  const projected = frac >= 1 ? actual : frac > 0 ? actual / frac : actual;
  const finished = today > to;
  return { percent, remaining: Math.max(target - actual, 0), expected, projected, frac, finished, atRisk: !finished && target > 0 && projected < target && actual < expected * 0.8 };
}

export interface AdTotals { spend_cents: number; impressions: number; clicks: number; leads: number; conversions: number; revenue_cents: number }
const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Indicadores de tráfego. Custos em centavos; ctr em %; roas em x. null quando o denominador é zero. */
export function adKpis(t: AdTotals) {
  return {
    ctr: div(t.clicks * 100, t.impressions), cpc: div(t.spend_cents, t.clicks), cpm: div(t.spend_cents * 1000, t.impressions),
    cpl: div(t.spend_cents, t.leads), cpa: div(t.spend_cents, t.conversions), roas: div(t.revenue_cents, t.spend_cents),
    convRate: div(t.leads * 100, t.clicks),
  };
}
export const sumAd = (rows: Partial<AdTotals>[]): AdTotals => rows.reduce<AdTotals>((a, r) => ({
  spend_cents: a.spend_cents + Number(r.spend_cents ?? 0), impressions: a.impressions + Number(r.impressions ?? 0), clicks: a.clicks + Number(r.clicks ?? 0),
  leads: a.leads + Number(r.leads ?? 0), conversions: a.conversions + Number(r.conversions ?? 0), revenue_cents: a.revenue_cents + Number(r.revenue_cents ?? 0),
}), { spend_cents: 0, impressions: 0, clicks: 0, leads: 0, conversions: 0, revenue_cents: 0 });

const norm = (h: string) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const COLS: Record<string, string[]> = {
  day: ['data', 'dia', 'date', 'day'],
  spend: ['gasto', 'investimento', 'spend', 'custo', 'valorgasto', 'amountspent', 'cost'],
  impressions: ['impressoes', 'impressions', 'impr'],
  clicks: ['cliques', 'clicks', 'cliquesnolink', 'linkclicks'],
  leads: ['leads', 'resultados', 'results', 'cadastros'],
  conversions: ['conversoes', 'conversions', 'compras', 'purchases', 'vendas'],
  revenue: ['receita', 'revenue', 'valordeconversao', 'conversionvalue', 'faturamento'],
};

export interface AdCsvRow { day: string; spend_cents: number; impressions: number; clicks: number; leads: number; conversions: number; revenue_cents: number }

/** Importa métricas diárias de CSV exportado do Meta/Google (separador ; , ou tab; datas dd/mm/aaaa ou aaaa-mm-dd). */
export function parseAdCsv(text: string): { rows: AdCsvRow[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  if (lines.length < 2) return { rows: [], errors: ['Cole o cabeçalho e ao menos uma linha de dados.'] };
  const sep = [';', '\t', ','].reduce((best, c) => (lines[0].split(c).length > lines[0].split(best).length ? c : best), ';');
  const header = lines[0].split(sep).map(norm);
  const idx: Record<string, number> = {};
  for (const [key, names] of Object.entries(COLS)) idx[key] = header.findIndex((h) => names.includes(h));
  if (idx.day < 0 || idx.spend < 0) return { rows: [], errors: ['Colunas obrigatórias não encontradas: "Data" e "Gasto/Investimento".'] };
  const rows: AdCsvRow[] = [];
  lines.slice(1).forEach((line, n) => {
    const c = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''));
    const d = c[idx.day];
    const day = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : /^\d{2}\/\d{2}\/\d{4}$/.test(d) ? d.split('/').reverse().join('-') : null;
    const spend = parseCents(c[idx.spend]);
    const int = (k: string) => (idx[k] >= 0 ? Math.max(Math.round(Number((c[idx[k]] ?? '').replace(/\./g, '').replace(',', '.')) || 0), 0) : 0);
    if (!day || Number.isNaN(Date.parse(day)) || spend == null) { errors.push(`Linha ${n + 2}: data ou gasto inválido.`); return; }
    rows.push({ day, spend_cents: spend, impressions: int('impressions'), clicks: int('clicks'), leads: int('leads'), conversions: int('conversions'), revenue_cents: idx.revenue >= 0 ? parseCents(c[idx.revenue]) ?? 0 : 0 });
  });
  return { rows, errors };
}

/** Matriz de semanas (domingo→sábado) com datas yyyy-mm-dd para o mês; células fora do mês são marcadas. */
export function monthGrid(year: number, month1: number) {
  const first = new Date(Date.UTC(year, month1 - 1, 1));
  const start = addDays(first.toISOString().slice(0, 10), -first.getUTCDay());
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => { const date = addDays(start, w * 7 + d); return { date, inMonth: Number(date.slice(5, 7)) === month1 }; });
    if (w >= 4 && !week.some((x) => x.inMonth)) break;
    weeks.push(week);
  }
  return weeks;
}

export const PROPOSAL_STATUS: Record<string, { label: string; tone: string }> = {
  rascunho: { label: 'Rascunho', tone: 'bg-subtle text-muted' },
  enviada: { label: 'Enviada', tone: 'bg-blue-500/10 text-blue-600' },
  visualizada: { label: 'Visualizada', tone: 'bg-violet-brand/10 text-violet-brand' },
  em_negociacao: { label: 'Em negociação', tone: 'bg-amber-500/15 text-warn' },
  aceita: { label: 'Aceita', tone: 'bg-ok/15 text-ok' },
  recusada: { label: 'Recusada', tone: 'bg-danger/10 text-danger' },
  expirada: { label: 'Expirada', tone: 'bg-subtle text-muted' },
};
export const CONTRACT_STATUS: Record<string, { label: string; tone: string }> = {
  rascunho: { label: 'Rascunho', tone: 'bg-subtle text-muted' },
  enviado: { label: 'Aguardando assinatura', tone: 'bg-amber-500/15 text-warn' },
  assinado: { label: 'Assinado', tone: 'bg-ok/15 text-ok' },
  cancelado: { label: 'Cancelado', tone: 'bg-danger/10 text-danger' },
};
export const TASK_STATUS = [
  { key: 'a_fazer', label: 'A fazer' }, { key: 'fazendo', label: 'Fazendo' }, { key: 'revisao', label: 'Em revisão' }, { key: 'feito', label: 'Feito' },
] as const;
export const PRIORITY: Record<string, { label: string; tone: string }> = {
  baixa: { label: 'Baixa', tone: 'bg-subtle text-muted' }, media: { label: 'Média', tone: 'bg-blue-500/10 text-blue-600' },
  alta: { label: 'Alta', tone: 'bg-amber-500/15 text-warn' }, urgente: { label: 'Urgente', tone: 'bg-danger/10 text-danger' },
};
export const NETWORKS: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: '#e1306c' }, tiktok: { label: 'TikTok', color: '#25d5c8' }, linkedin: { label: 'LinkedIn', color: '#0a66c2' },
  youtube: { label: 'YouTube', color: '#e02b20' }, pinterest: { label: 'Pinterest', color: '#e60023' }, facebook: { label: 'Facebook', color: '#1877f2' },
  x: { label: 'X / Twitter', color: '#888888' }, threads: { label: 'Threads', color: '#7327ea' }, blog: { label: 'Blog', color: '#f59e0b' },
};
export const FORMATS: Record<string, string> = { feed: 'Feed', carrossel: 'Carrossel', reels: 'Reels', story: 'Stories', video: 'Vídeo', artigo: 'Artigo', thread: 'Thread', outro: 'Outro' };
export const POST_STATUS = [
  { key: 'ideia', label: 'Ideia' }, { key: 'roteiro', label: 'Roteiro / copy' }, { key: 'criacao', label: 'Criação' },
  { key: 'aprovacao', label: 'Aprovação' }, { key: 'agendado', label: 'Agendado' }, { key: 'publicado', label: 'Publicado' },
] as const;
export const AD_PLATFORMS: Record<string, string> = { meta: 'Meta Ads', google: 'Google Ads', tiktok: 'TikTok Ads', linkedin: 'LinkedIn Ads', pinterest: 'Pinterest Ads', outro: 'Outra' };
export const AD_OBJECTIVES: Record<string, string> = { leads: 'Geração de leads', vendas: 'Vendas', trafego: 'Tráfego', reconhecimento: 'Reconhecimento', engajamento: 'Engajamento', mensagens: 'Mensagens' };
export const GOAL_KINDS: Record<string, { label: string; money: boolean }> = {
  receita: { label: 'Faturamento (recebido)', money: true }, lucro: { label: 'Lucro (recebido − pago)', money: true },
  novos_clientes: { label: 'Novos clientes', money: false }, propostas_fechadas: { label: 'Propostas fechadas', money: false },
  novos_leads: { label: 'Novos leads', money: false }, posts_publicados: { label: 'Posts publicados', money: false },
};
export const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
