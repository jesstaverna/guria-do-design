import { requireWorkspace } from '@/lib/session';
import { Field, MonthNav, PageHeader, Section, Stat } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { ProgressBar, RevenueChart } from '@/components/Charts';
import { GOAL_KINDS, MONTHS_PT, addMonths, goalProgress, monthRange, parseCents, todayBR } from '@/lib/domain';
import { centsToInput, dateBR, money, num, pct } from '@/lib/format';
import { createGoal, deleteGoal, saveBudget } from './actions';

export const metadata = { title: 'Metas e planejamento' };

interface Goal { goal_id: string; kind: string; period_start: string; period_end: string; target: number; actual: number; note: string | null }

export default async function Planejamento({ searchParams }: { searchParams: Promise<{ m?: string; want?: string; exp?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('planejamento');
  const sp = await searchParams;
  const today = todayBR();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const { from, to } = monthRange(y, mo);
  const hist0 = addMonths(`${ym}-01`, -5);
  const fut1 = addMonths(`${ym}-01`, 3);

  const [{ data: goalsRaw }, { data: cats }, { data: budgets }, { data: tx }, { data: props }] = await Promise.all([
    supabase.rpc('goal_progress', { p_ws: ws.id }),
    supabase.from('fin_categories').select('id, name').eq('workspace_id', ws.id).eq('direction', 'out').order('name'),
    supabase.from('budgets').select('category_id, planned_cents').eq('workspace_id', ws.id).eq('month', `${ym}-01`),
    supabase.from('fin_transactions').select('direction, amount_cents, status, due_date, paid_date, category_id').eq('workspace_id', ws.id).gte('due_date', hist0).lt('due_date', fut1).neq('status', 'cancelado').limit(10000),
    supabase.from('proposals').select('status, total_cents, sent_at, accepted_at').eq('workspace_id', ws.id).gte('created_at', `${addMonths(`${ym}-01`, -5)}T00:00:00Z`).limit(2000),
  ]);
  const goals = (goalsRaw ?? []) as Goal[];
  const planned = new Map((budgets ?? []).map((b) => [b.category_id, Number(b.planned_cents)]));
  const rows = tx ?? [];

  // histórico + projeção (6 meses passados/atual + 3 futuros) por competência de vencimento
  const months: string[] = Array.from({ length: 9 }, (_, i) => addMonths(`${ym}-01`, i - 5).slice(0, 7));
  const chart = months.map((mm) => {
    const inM = rows.filter((r) => r.due_date.startsWith(mm));
    const a = inM.filter((r) => r.direction === 'in').reduce((s, r) => s + Number(r.amount_cents), 0);
    const b = inM.filter((r) => r.direction === 'out').reduce((s, r) => s + Number(r.amount_cents), 0);
    return { label: `${MONTHS_PT[Number(mm.slice(5)) - 1].slice(0, 3)}${mm > today.slice(0, 7) ? '*' : ''}`, a, b };
  });

  // gasto real por categoria no mês
  const spent = new Map<string, number>();
  rows.filter((r) => r.direction === 'out' && r.due_date >= from && r.due_date <= to).forEach((r) => spent.set(r.category_id ?? 'none', (spent.get(r.category_id ?? 'none') ?? 0) + Number(r.amount_cents)));
  const totalPlanned = [...planned.values()].reduce((a, b) => a + b, 0);
  const totalSpent = [...spent.values()].reduce((a, b) => a + b, 0);

  // calculadora de meta de faturamento
  const last3 = months.slice(2, 5);
  const avgExp = Math.round(last3.reduce((s, mm) => s + rows.filter((r) => r.direction === 'out' && r.due_date.startsWith(mm)).reduce((a, r) => a + Number(r.amount_cents), 0), 0) / 3);
  const wantC = parseCents(sp.want ?? '') ?? 0;
  const expC = sp.exp != null && sp.exp !== '' ? parseCents(sp.exp) ?? avgExp : avgExp;
  const tax = Number(ws.tax_rate_pct) || 0;
  const needed = wantC > 0 ? Math.ceil((wantC + expC) / (1 - Math.min(tax, 90) / 100)) : 0;
  const accepted = (props ?? []).filter((p) => p.status === 'aceita');
  const sent = (props ?? []).filter((p) => p.status !== 'rascunho');
  const ticket = accepted.length ? Math.round(accepted.reduce((s, p) => s + Number(p.total_cents), 0) / accepted.length) : 0;
  const closeRate = sent.length ? accepted.length / sent.length : 0;
  const deals = ticket > 0 && needed > 0 ? Math.ceil(needed / ticket) : 0;
  const proposalsNeeded = closeRate > 0 ? Math.ceil(deals / closeRate) : 0;

  return (
    <>
      <PageHeader title="Metas e planejamento financeiro" subtitle="Defina quanto precisa faturar, acompanhe o ritmo e controle o orçamento." actions={<MonthNav base="/planejamento" ym={ym} label={`${MONTHS_PT[mo - 1]} ${y}`} />} />

      <Section title="Metas">
        {!goals.length ? <p className="mb-4 text-sm text-muted">Nenhuma meta ainda. Crie a primeira abaixo, por exemplo “Faturamento de {MONTHS_PT[mo - 1]}”.</p> : (
          <ul className="mb-6 space-y-5">{goals.map((g) => {
            const money_ = GOAL_KINDS[g.kind]?.money;
            const gp = goalProgress({ target: Number(g.target), actual: Number(g.actual), from: g.period_start, to: g.period_end, today });
            const f = (v: number) => (money_ ? money(v) : num(Math.round(v)));
            return (
              <li key={g.goal_id}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2"><div className="text-sm font-medium">{GOAL_KINDS[g.kind]?.label} <span className="font-normal text-muted">· {dateBR(g.period_start)} a {dateBR(g.period_end)}</span></div>
                  <div className="text-sm"><b>{f(Number(g.actual))}</b> <span className="text-muted">de {f(Number(g.target))} ({pct(gp.percent)})</span></div></div>
                <ProgressBar value={gp.percent} tone={gp.atRisk ? 'danger' : gp.percent >= 100 ? 'ok' : 'accent'} />
                <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-muted">
                  <span>{gp.finished ? (gp.percent >= 100 ? 'Meta batida 🎉' : `Faltaram ${f(gp.remaining)}`) : `Faltam ${f(gp.remaining)} · projeção no ritmo atual: ${f(gp.projected)}`}</span>
                  <span className="flex items-center gap-3">{gp.atRisk && <b className="text-danger">Em risco</b>}{open && <form action={deleteGoal.bind(null, g.goal_id)}><SubmitButton className="underline" pendingText="…" confirm="Remover esta meta?">Remover</SubmitButton></form>}</span>
                </div>
              </li>
            );
          })}</ul>
        )}
        {open && (
          <form action={createGoal} className="grid gap-3 border-t border-line pt-5 sm:grid-cols-5">
            <Field label="Tipo"><select name="kind" className="input">{Object.entries(GOAL_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            <Field label="Mês"><input name="month" type="month" defaultValue={ym} className="input" /></Field>
            <Field label="Meta" hint="R$ ou quantidade"><input name="target" required inputMode="decimal" className="input" defaultValue={needed ? centsToInput(needed) : ''} /></Field>
            <Field label="Observação"><input name="note" className="input" /></Field>
            <div className="flex items-end"><SubmitButton pendingText="…">Criar meta</SubmitButton></div>
          </form>
        )}
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Quanto preciso faturar?">
          <form className="mb-4 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="m" value={ym} />
            <Field label="Quero ficar com (R$/mês)"><input name="want" defaultValue={sp.want ?? ''} inputMode="decimal" className="input" placeholder="5.000,00" /></Field>
            <Field label="Despesas mensais (R$)" hint={`média dos últimos 3 meses: ${money(avgExp)}`}><input name="exp" defaultValue={sp.exp ?? ''} inputMode="decimal" className="input" placeholder={centsToInput(avgExp)} /></Field>
            <div className="flex items-end"><button className="btn">Calcular</button></div>
          </form>
          {needed > 0 ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-accent/10 p-4"><div className="text-xs uppercase tracking-wider text-muted">Faturamento necessário</div><div className="mt-1 text-2xl font-semibold">{money(needed)}<span className="text-sm font-normal text-muted"> /mês</span></div><div className="mt-1 text-xs text-muted">(desejado + despesas) ÷ (1 − imposto de {pct(tax)}) — ajuste o imposto em Configurações.</div></div>
              {ticket > 0 ? <p>Com ticket médio de <b>{money(ticket)}</b> nas propostas aceitas, são ~<b>{deals}</b> fechamento(s) por mês{closeRate > 0 && <> — e, com taxa de aceite de {pct(closeRate * 100)}, cerca de <b>{proposalsNeeded}</b> proposta(s) enviada(s)</>}.</p> : <p className="text-muted">Sem propostas aceitas ainda para estimar ticket médio e volume de propostas.</p>}
            </div>
          ) : <p className="text-sm text-muted">Informe quanto quer ficar no bolso por mês para descobrir a meta de faturamento, considerando despesas e imposto.</p>}
        </Section>
        <Section title="Caixa: histórico e previsão"><RevenueChart data={chart} aLabel="Entradas" bLabel="Saídas" /><p className="mt-2 text-xs text-muted">Barras com * são meses futuros: incluem parcelas, mensalidades e despesas já previstas (por vencimento).</p></Section>
      </div>

      <Section title={`Orçamento de ${MONTHS_PT[mo - 1]} (despesas)`}>
        <div className="mb-4 grid gap-4 sm:grid-cols-3"><Stat label="Planejado" value={money(totalPlanned)} /><Stat label="Realizado (vencimentos do mês)" value={money(totalSpent)} /><Stat label="Diferença" value={money(totalPlanned - totalSpent)} tone={totalPlanned && totalSpent > totalPlanned ? 'danger' : 'ok'} /></div>
        <form action={saveBudget.bind(null, ym)}>
          <div className="table-wrap"><table className="w-full"><thead><tr><th className="th">Categoria</th><th className="th text-right">Planejado (R$)</th><th className="th text-right">Realizado</th><th className="th">Uso</th></tr></thead>
            <tbody className="divide-y divide-line">{cats?.map((c) => {
              const p = planned.get(c.id) ?? 0, s = spent.get(c.id) ?? 0;
              return (<tr key={c.id}><td className="td">{c.name}</td>
                <td className="td text-right"><input name={`cat_${c.id}`} defaultValue={p ? centsToInput(p) : ''} inputMode="decimal" disabled={!open} className="input !w-32 !py-1.5 text-right" aria-label={`Orçamento de ${c.name}`} /></td>
                <td className="td text-right">{money(s)}</td>
                <td className="td w-40">{p > 0 ? <ProgressBar value={(s / p) * 100} tone={s > p ? 'danger' : 'accent'} /> : <span className="text-xs text-muted">—</span>}</td></tr>);
            })}</tbody></table></div>
          {open && <div className="mt-4"><SubmitButton pendingText="…">Salvar orçamento</SubmitButton></div>}
        </form>
      </Section>
    </>
  );
}
