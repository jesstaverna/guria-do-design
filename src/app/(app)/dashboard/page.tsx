import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { PageHeader, Section, Stat } from '@/components/ui';
import { ProgressBar, RevenueChart } from '@/components/Charts';
import { GOAL_KINDS, MONTHS_PT, NETWORKS, addDays, addMonths, goalProgress, monthRange, todayBR } from '@/lib/domain';
import { ListChecks, Megaphone, SeverityIcon, CheckCircle2 } from '@/components/Icon';
import { dateBR, money, moneyCompact, num, pct } from '@/lib/format';

export const metadata = { title: 'Painel' };

type M = Record<string, number | null>;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { supabase, ws, isAdmin, profile } = await requireWorkspace('dashboard');
  const sp = await searchParams;
  const today = todayBR();
  const [y, mo] = today.split('-').map(Number);
  const range = sp.p === '30d' ? { from: addDays(today, -29), to: today, label: 'Últimos 30 dias' }
    : sp.p === 'ano' ? { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
    : sp.p === 'anterior' ? (() => { const prev = addMonths(`${y}-${String(mo).padStart(2, '0')}-01`, -1); const [py, pm] = prev.split('-').map(Number); return { ...monthRange(py, pm), label: `${MONTHS_PT[pm - 1]} ${py}` }; })()
    : { ...monthRange(y, mo), label: `${MONTHS_PT[mo - 1]} ${y}` };
  const hist0 = addMonths(`${y}-${String(mo).padStart(2, '0')}-01`, -5);

  const [metrics, goals, paid, stages, leads, tasks, posts, notes] = await Promise.all([
    supabase.rpc('dashboard_metrics', { p_ws: ws.id, p_from: range.from, p_to: range.to }),
    isAdmin ? supabase.rpc('goal_progress', { p_ws: ws.id }) : Promise.resolve({ data: [] }),
    isAdmin ? supabase.from('fin_transactions').select('direction, amount_cents, paid_date').eq('workspace_id', ws.id).eq('status', 'pago').gte('paid_date', hist0).limit(10000) : Promise.resolve({ data: [] as { direction: string; amount_cents: number; paid_date: string }[] }),
    supabase.from('pipeline_stages').select('id, name, kind').eq('workspace_id', ws.id).order('position'),
    supabase.from('leads').select('stage_id, potential_value_cents').eq('workspace_id', ws.id).limit(2000),
    supabase.from('tasks').select('id, title, due_date, priority').eq('workspace_id', ws.id).neq('status', 'feito').lte('due_date', addDays(today, 7)).order('due_date').limit(8),
    supabase.from('content_posts').select('id, title, network, publish_date, status').eq('workspace_id', ws.id).neq('status', 'publicado').gte('publish_date', today).lte('publish_date', addDays(today, 7)).order('publish_date').limit(8),
    supabase.from('notifications').select('id, title, severity, link').eq('workspace_id', ws.id).is('read_at', null).order('created_at', { ascending: false }).limit(5),
  ]);
  const m = (metrics.data ?? {}) as M;
  const v = (k: string) => Number(m[k] ?? 0);

  const months = Array.from({ length: 6 }, (_, i) => addMonths(`${y}-${String(mo).padStart(2, '0')}-01`, i - 5).slice(0, 7));
  const chart = months.map((mm) => ({
    label: MONTHS_PT[Number(mm.slice(5)) - 1].slice(0, 3),
    a: (paid.data ?? []).filter((r) => r.direction === 'in' && r.paid_date.startsWith(mm)).reduce((s, r) => s + Number(r.amount_cents), 0),
    b: (paid.data ?? []).filter((r) => r.direction === 'out' && r.paid_date.startsWith(mm)).reduce((s, r) => s + Number(r.amount_cents), 0),
  }));
  const stageCount = (stages.data ?? []).map((s) => ({ ...s, n: (leads.data ?? []).filter((l) => l.stage_id === s.id).length, total: (leads.data ?? []).filter((l) => l.stage_id === s.id).reduce((a, l) => a + Number(l.potential_value_cents), 0) }));
  const maxN = Math.max(1, ...stageCount.map((s) => s.n));
  const taxEst = isAdmin ? Math.round((v('received_cents') * Number(m.tax_rate_pct ?? 0)) / 100) : 0;
  const activeGoals = ((goals.data ?? []) as { goal_id: string; kind: string; period_start: string; period_end: string; target: number; actual: number }[]).filter((g) => g.period_end >= today && g.period_start <= today).slice(0, 4);
  const conv = v('leads_won') + v('leads_lost') > 0 ? (v('leads_won') / (v('leads_won') + v('leads_lost'))) * 100 : null;

  return (
    <>
      <PageHeader title={`Olá, ${(profile.full_name || '').split(' ')[0] || 'bem-vinda'} 👋`} subtitle={`${ws.name} · ${range.label}`} actions={<div className="flex flex-wrap gap-1">
        {[['', 'Este mês'], ['anterior', 'Mês anterior'], ['30d', '30 dias'], ['ano', 'Ano']].map(([k, l]) => <Link key={k} href={k ? `/dashboard?p=${k}` : '/dashboard'} className={`btn btn-sm ${(sp.p ?? '') === k ? 'btn-dark' : ''}`}>{l}</Link>)}</div>} />

      {isAdmin && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Recebido" value={money(v('received_cents'))} tone="accent" hint={`despesas pagas: ${money(v('spent_cents'))}`} href="/financeiro" />
          <Stat label="Lucro realizado" value={money(v('received_cents') - v('spent_cents'))} hint={taxEst ? `imposto estimado: ${money(taxEst)}` : 'recebido − pago'} />
          <Stat label="A receber no período" value={money(v('receivable_cents'))} hint={`MRR: ${money(v('mrr_cents'))}`} href="/financeiro" />
          <Stat label="Em atraso" value={money(v('overdue_cents'))} tone={v('overdue_cents') ? 'danger' : undefined} hint={`${v('overdue_count')} cobrança(s)`} href="/financeiro" />
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Leads novos" value={num(v('leads_new'))} hint={conv != null ? `conversão ${pct(conv)}` : `${num(v('leads_won'))} fechado(s)`} href="/crm" />
        <Stat label="Pipeline em aberto" value={moneyCompact(v('pipeline_open_cents'))} hint={`ponderado ${moneyCompact(v('pipeline_weighted_cents'))}`} href="/crm" />
        <Stat label="Propostas abertas" value={num(v('proposals_open'))} hint={`${num(v('proposals_accepted'))} aceita(s) · ${money(v('proposals_accepted_cents'))}`} href="/propostas" />
        <Stat label="Contratos a assinar" value={num(v('contracts_awaiting'))} href="/contratos" />
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tarefas atrasadas" value={num(v('tasks_overdue'))} tone={v('tasks_overdue') ? 'danger' : 'ok'} hint={`${num(v('tasks_open'))} em aberto`} href="/tarefas" />
        <Stat label="Prazos em 7 dias" value={num(v('tasks_week'))} hint={`${num(v('tasks_done'))} concluída(s) no período`} href="/agenda" />
        <Stat label="Posts nos próximos 7 dias" value={num(v('posts_week'))} hint={`${num(v('posts_published'))} publicado(s) no período`} href="/conteudo" />
        <Stat label="Tráfego pago" value={money(v('ads_spend_cents'))} hint={`${num(v('ads_leads'))} leads${v('ads_leads') ? ` · CPL ${money(v('ads_spend_cents') / v('ads_leads'))}` : ''}`} href="/trafego" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isAdmin && <Section title="Entradas × saídas (últimos 6 meses)"><RevenueChart data={chart} /></Section>}
          <Section title="Funil de vendas" actions={<Link href="/crm" className="text-xs underline">Abrir CRM</Link>}>
            {!(leads.data?.length) ? <p className="text-sm text-muted">Sem leads ainda. <Link href="/crm/novo" className="underline">Cadastre o primeiro</Link>.</p> : (
              <ul className="space-y-3">{stageCount.map((s) => (<li key={s.id}><div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span className="text-muted">{s.n} · {moneyCompact(s.total)}</span></div>
                <div className="h-2.5 overflow-hidden rounded-full bg-subtle"><div className={`h-full rounded-full ${s.kind === 'won' ? 'bg-ok' : s.kind === 'lost' ? 'bg-danger/60' : 'bg-accent'}`} style={{ width: `${(s.n / maxN) * 100}%` }} /></div></li>))}</ul>
            )}
          </Section>
        </div>
        <div className="space-y-6">
          {isAdmin && (
            <Section title="Metas do período" actions={<Link href="/planejamento" className="text-xs underline">Planejar</Link>}>
              {!activeGoals.length ? <p className="text-sm text-muted">Nenhuma meta ativa. <Link href="/planejamento" className="underline">Defina uma meta</Link>.</p> : (
                <ul className="space-y-4">{activeGoals.map((g) => { const gp = goalProgress({ target: Number(g.target), actual: Number(g.actual), from: g.period_start, to: g.period_end, today }); const mn = GOAL_KINDS[g.kind]?.money; return (
                  <li key={g.goal_id}><div className="mb-1 flex justify-between text-sm"><span>{GOAL_KINDS[g.kind]?.label}</span><span className="text-muted">{pct(gp.percent)}</span></div><ProgressBar value={gp.percent} tone={gp.atRisk ? 'danger' : 'accent'} /><div className="mt-1 text-xs text-muted">{mn ? money(Number(g.actual)) : num(Number(g.actual))} de {mn ? money(Number(g.target)) : num(Number(g.target))}{gp.atRisk ? ' · em risco' : ''}</div></li>); })}</ul>
              )}
            </Section>
          )}
          <Section title="Alertas" actions={<Link href="/alertas" className="text-xs underline">Ver todos</Link>}>
            {!notes.data?.length ? <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="h-4 w-4 text-ok" strokeWidth={1.8} aria-hidden />Tudo em ordem.</p> : <ul className="space-y-2.5 text-sm">{notes.data.map((n) => { const SI = SeverityIcon[n.severity as keyof typeof SeverityIcon] ?? SeverityIcon.info; return <li key={n.id} className="flex items-start gap-2.5"><SI className={`mt-0.5 h-4 w-4 shrink-0 ${n.severity === 'critical' ? 'text-danger' : n.severity === 'warning' ? 'text-warn' : 'text-violet-brand'}`} strokeWidth={1.8} aria-hidden />{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</li>; })}</ul>}
          </Section>
          <Section title="Próximos prazos" actions={<Link href="/agenda" className="text-xs underline">Agenda</Link>}>
            {!tasks.data?.length && !posts.data?.length ? <p className="text-sm text-muted">Nada nos próximos 7 dias.</p> : <ul className="space-y-2 text-sm">
              {tasks.data?.map((t) => <li key={t.id} className="flex justify-between gap-2"><span className="flex items-start gap-2"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-muted" strokeWidth={1.7} aria-hidden />{t.title}</span><span className={`shrink-0 ${t.due_date! < today ? 'font-medium text-danger' : 'text-muted'}`}>{dateBR(t.due_date)}</span></li>)}
              {posts.data?.map((p) => <li key={p.id} className="flex justify-between gap-2"><Link href={`/conteudo/${p.id}`} className="flex items-start gap-2 hover:underline"><Megaphone className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.7} style={{ color: NETWORKS[p.network]?.color }} aria-hidden />{p.title}</Link><span className="shrink-0 text-muted">{dateBR(p.publish_date)}</span></li>)}</ul>}
          </Section>
        </div>
      </div>
    </>
  );
}
