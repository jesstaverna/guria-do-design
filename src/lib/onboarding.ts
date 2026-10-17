// Regras puras do onboarding (testadas em onboarding.test.ts).
const fold = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export interface TemplateLite { id: string; name: string; keywords: string | null }

/** Sugere o modelo cujas palavras-chave mais aparecem no título e nos itens da proposta (sem diferenciar acento/caixa). */
export function suggestTemplate(text: string, templates: TemplateLite[]): string | null {
  const t = fold(text); let best: { id: string; score: number } | null = null;
  for (const tpl of templates) {
    const words = fold(`${tpl.name},${tpl.keywords ?? ''}`).split(/[,;]+/).map((w) => w.trim()).filter((w) => w.length >= 3);
    const score = words.filter((w) => t.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: tpl.id, score };
  }
  return best?.id ?? null;
}

export interface StepLite { duration_days: number }
/** Datas de entrega de cada etapa a partir do início (cada etapa soma a sua duração). */
export function chainDates(start: string, steps: StepLite[]): string[] {
  const d = new Date(`${start}T12:00:00Z`); const out: string[] = [];
  for (const s of steps) { d.setUTCDate(d.getUTCDate() + s.duration_days); out.push(d.toISOString().slice(0, 10)); }
  return out;
}

/** Progresso (0-100) das etapas visíveis ao cliente. */
export const progressPct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
