import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, Field, MonthNav, PageHeader, Section, Stat, Tabs } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { MONTHS_PT, monthRange, todayBR } from '@/lib/domain';
import { dateBR, money } from '@/lib/format';
import { createRecurring, createTransaction, generateNow, removeTransaction, reopen, settle, toggleRecurring } from './actions';

export const metadata = { title: 'Financeiro' };

export default async function Financeiro({ searchParams }: { searchParams: Promise<{ m?: string; tab?: string; dir?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('financeiro');
  const sp = await searchParams;
  const tab = sp.tab === 'recorrencias' ? 'recorrencias' : 'lancamentos';
  const today = todayBR();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const { from, to } = monthRange(y, mo);
  const back = `/financeiro?m=${ym}${sp.dir ? `&dir=${sp.dir}` : ''}`;

  const [{ data: cats }, { data: clients }] = await Promise.all([
    supabase.from('fin_categories').select('id, name, direction').eq('workspace_id', ws.id).order('name'),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
  ]);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
  const cliName = new Map((clients ?? []).map((c) => [c.id, c.name]));

  const txForm = (action: (fd: FormData) => Promise<void>, direction: 'in' | 'out') => (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-4">
      <input type="hidden" name="direction" value={direction} />
      <Field label="Descrição *" className="sm:col-span-2"><input name="description" required className="input" /></Field>
      <Field label="Valor (R$) *"><input name="amount" required inputMode="decimal" className="input" /></Field>
      <Field label="Vencimento *"><input name="due_date" type="date" required defaultValue={today} className="input" /></Field>
      <Field label="Categoria"><select name="category_id" className="input"><option value="">—</option>{cats?.filter((c) => c.direction === direction).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Cliente"><select name="client_id" className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <label className="flex items-end gap-2 pb-2.5 text-sm"><input type="checkbox" name="paid" />Já {direction === 'in' ? 'recebido' : 'pago'}</label>
      <div className="flex items-end"><SubmitButton pendingText="…">Salvar</SubmitButton></div>
    </form>
  );

  if (tab === 'recorrencias') {
    const { data: rec } = await supabase.from('fin_recurring').select('*').eq('workspace_id', ws.id).order('active', { ascending: false }).order('description');
    return (
      <>
        <PageHeader title="Financeiro" subtitle="Receitas e despesas fixas geradas automaticamente todo mês." actions={open && <form action={generateNow}><SubmitButton className="btn btn-sm" pendingText="…">Gerar lançamentos agora</SubmitButton></form>} />
        <Tabs current={tab} items={[{ key: 'lancamentos', label: 'Lançamentos', href: '/financeiro' }, { key: 'recorrencias', label: 'Recorrências', href: '/financeiro?tab=recorrencias' }]} />
        {open && (
          <details className="card mb-6 !p-4"><summary className="cursor-pointer text-sm font-medium">+ Nova recorrência (assinatura, mensalidade, aluguel…)</summary>
            <form action={createRecurring} className="mt-4 grid gap-3 sm:grid-cols-4">
              <Field label="Tipo"><select name="direction" className="input"><option value="out">Despesa</option><option value="in">Receita</option></select></Field>
              <Field label="Descrição *" className="sm:col-span-2"><input name="description" required className="input" placeholder="Ex.: Adobe CC, Mensalidade Cliente X" /></Field>
              <Field label="Valor mensal (R$) *"><input name="amount" required inputMode="decimal" className="input" /></Field>
              <Field label="Dia do vencimento"><input name="day_of_month" type="number" min={1} max={28} defaultValue={5} className="input" /></Field>
              <Field label="Início *"><input name="start_date" type="date" required defaultValue={today} className="input" /></Field>
              <Field label="Fim (opcional)"><input name="end_date" type="date" className="input" /></Field>
              <Field label="Categoria"><select name="category_id" className="input"><option value="">—</option>{cats?.map((c) => <option key={c.id} value={c.id}>{c.direction === 'in' ? '↑' : '↓'} {c.name}</option>)}</select></Field>
              <Field label="Cliente"><select name="client_id" className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <div className="flex items-end"><SubmitButton pendingText="…">Salvar</SubmitButton></div>
            </form></details>
        )}
        {!rec?.length ? <Empty title="Sem recorrências" text="Cadastre despesas fixas (ferramentas, aluguel) e mensalidades de clientes para prever o caixa." /> : (
          <div className="table-wrap"><table className="w-full"><thead><tr><th className="th">Descrição</th><th className="th">Tipo</th><th className="th text-right">Valor</th><th className="th">Dia</th><th className="th">Período</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">{rec.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'opacity-50'}><td className="td font-medium">{r.description}<div className="text-xs font-normal text-muted">{r.client_id ? cliName.get(r.client_id) : r.category_id ? catName.get(r.category_id) : ''}</div></td>
                <td className="td"><Badge tone={r.direction === 'in' ? 'bg-ok/15 text-ok' : 'bg-danger/10 text-danger'}>{r.direction === 'in' ? 'Receita' : 'Despesa'}</Badge></td><td className="td text-right">{money(r.amount_cents)}</td><td className="td">{r.day_of_month}</td>
                <td className="td text-muted">{dateBR(r.start_date)} → {r.end_date ? dateBR(r.end_date) : 'sem fim'}</td>
                <td className="td text-right">{open && <form action={toggleRecurring.bind(null, r.id, !r.active)}><SubmitButton className="btn btn-sm" pendingText="…">{r.active ? 'Pausar' : 'Reativar'}</SubmitButton></form>}</td></tr>))}</tbody></table></div>
        )}
      </>
    );
  }

  let q = supabase.from('fin_transactions').select('*').eq('workspace_id', ws.id).gte('due_date', from).lte('due_date', to).neq('status', 'cancelado').order('due_date').limit(1000);
  if (sp.dir === 'in' || sp.dir === 'out') q = q.eq('direction', sp.dir);
  const [{ data: all }, { data: late }] = await Promise.all([
    q,
    supabase.from('fin_transactions').select('id, description, amount_cents, due_date, client_id').eq('workspace_id', ws.id).eq('direction', 'in').eq('status', 'previsto').lt('due_date', today).order('due_date').limit(50),
  ]);
  const rows = all ?? [];
  const sum = (d: string, s: string) => rows.filter((r) => r.direction === d && (s === '*' || r.status === s)).reduce((a, r) => a + Number(r.amount_cents), 0);

  return (
    <>
      <PageHeader title="Financeiro" subtitle="Contas a receber e a pagar do estúdio." actions={<MonthNav base="/financeiro" ym={ym} label={`${MONTHS_PT[mo - 1]} ${y}`} extra={sp.dir ? `&dir=${sp.dir}` : ''} />} />
      <Tabs current={tab} items={[{ key: 'lancamentos', label: 'Lançamentos', href: '/financeiro' }, { key: 'recorrencias', label: 'Recorrências', href: '/financeiro?tab=recorrencias' }]} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Recebido" value={money(sum('in', 'pago'))} tone="ok" /><Stat label="A receber" value={money(sum('in', 'previsto'))} /><Stat label="Pago" value={money(sum('out', 'pago'))} /><Stat label="A pagar" value={money(sum('out', 'previsto'))} />
        <Stat label="Saldo realizado" value={money(sum('in', 'pago') - sum('out', 'pago'))} tone="accent" hint="recebido − pago no mês" />
      </div>
      {!!late?.length && (
        <div className="mb-6 rounded-2xl border border-danger/40 bg-danger/5 p-4"><div className="mb-2 text-sm font-semibold text-danger">Em atraso: {money(late.reduce((s, r) => s + Number(r.amount_cents), 0))} ({late.length})</div>
          <ul className="space-y-1 text-sm">{late.map((r) => <li key={r.id}>{dateBR(r.due_date)} · {r.description} · {money(r.amount_cents)} {r.client_id && <span className="text-muted">({cliName.get(r.client_id)})</span>}</li>)}</ul></div>
      )}
      <div className="mb-5 flex flex-wrap gap-2"><Link href={`/financeiro?m=${ym}`} className={`btn btn-sm ${!sp.dir ? 'btn-dark' : ''}`}>Tudo</Link><Link href={`/financeiro?m=${ym}&dir=in`} className={`btn btn-sm ${sp.dir === 'in' ? 'btn-dark' : ''}`}>Receitas</Link><Link href={`/financeiro?m=${ym}&dir=out`} className={`btn btn-sm ${sp.dir === 'out' ? 'btn-dark' : ''}`}>Despesas</Link></div>
      {open && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <details className="card !p-4"><summary className="cursor-pointer text-sm font-medium">+ Receita</summary>{txForm(createTransaction.bind(null, back), 'in')}</details>
          <details className="card !p-4"><summary className="cursor-pointer text-sm font-medium">+ Despesa</summary>{txForm(createTransaction.bind(null, back), 'out')}</details>
        </div>
      )}
      {!rows.length ? <Empty title="Sem lançamentos neste mês" text="Cadastre receitas e despesas ou ative uma proposta aceita para gerar as parcelas." /> : (
        <div className="table-wrap"><table className="w-full">
          <thead><tr><th className="th">Vencimento</th><th className="th">Descrição</th><th className="th">Categoria / cliente</th><th className="th text-right">Valor</th><th className="th">Status</th><th className="th" /></tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r) => {
            const isLate = r.status === 'previsto' && r.due_date < today;
            return (
              <tr key={r.id}><td className="td">{dateBR(r.due_date)}</td><td className="td font-medium">{r.description}</td><td className="td text-muted">{[r.category_id && catName.get(r.category_id), r.client_id && cliName.get(r.client_id)].filter(Boolean).join(' · ') || '—'}</td>
                <td className={`td text-right ${r.direction === 'in' ? 'text-ok' : ''}`}>{r.direction === 'out' && '− '}{money(r.amount_cents)}</td>
                <td className="td"><Badge tone={r.status === 'pago' ? 'bg-ok/15 text-ok' : isLate ? 'bg-danger/10 text-danger' : undefined}>{r.status === 'pago' ? (r.direction === 'in' ? 'Recebido' : 'Pago') : isLate ? 'Atrasado' : 'Previsto'}{r.paid_date ? ` ${dateBR(r.paid_date).slice(0, 5)}` : ''}</Badge></td>
                <td className="td"><div className="flex justify-end gap-2">{open && (r.status === 'previsto'
                  ? <form action={settle.bind(null, back, r.id)}><SubmitButton className="btn btn-sm" pendingText="…">{r.direction === 'in' ? 'Receber' : 'Pagar'}</SubmitButton></form>
                  : <form action={reopen.bind(null, back, r.id)}><SubmitButton className="btn btn-sm" pendingText="…">Desfazer</SubmitButton></form>)}
                  {open && <form action={removeTransaction.bind(null, back, r.id)}><SubmitButton className="btn btn-sm !text-danger" pendingText="…" confirm="Excluir este lançamento?">×</SubmitButton></form>}</div></td></tr>
            );
          })}</tbody></table></div>
      )}
      <Section title="Como funciona"><p className="text-sm text-muted">“Receber/Pagar” registra a baixa com a data de hoje. Valores a receber vencidos geram alerta automático ao titular. Para parcelas de propostas, abra a proposta aceita e use <b>Ativar financeiro</b>.</p></Section>
    </>
  );
}
