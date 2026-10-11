import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { PageHeader, MonthNav, Section } from '@/components/ui';
import { MONTHS_PT, NETWORKS, addDays, monthGrid, pad2, todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Agenda e prazos' };

interface Item { date: string; label: string; href: string; kind: 'tarefa' | 'post' | 'financeiro' | 'proposta' | 'projeto' | 'lead'; late?: boolean }
const KIND: Record<Item['kind'], string> = {
  tarefa: 'bg-accent/15 text-accent-ink', post: 'bg-violet-brand/15 text-violet-brand', financeiro: 'bg-ok/15 text-ok',
  proposta: 'bg-amber-500/15 text-warn', projeto: 'bg-blue-500/15 text-blue-600', lead: 'bg-subtle text-muted',
};
const KIND_LABEL: Record<Item['kind'], string> = { tarefa: 'Tarefa', post: 'Publicação', financeiro: 'Financeiro', proposta: 'Proposta', projeto: 'Projeto', lead: 'Follow-up' };

export default async function Agenda({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { supabase, ws, isAdmin } = await requireWorkspace('agenda');
  const { m } = await searchParams;
  const today = todayBR();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(m ?? '') ? m! : today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const weeks = monthGrid(y, mo);
  const from = weeks[0][0].date, to = weeks[weeks.length - 1][6].date;
  const wid = ws.id;
  const [tasks, posts, projects, props, leads, fin] = await Promise.all([
    supabase.from('tasks').select('id, title, due_date, status').eq('workspace_id', wid).neq('status', 'feito').gte('due_date', from).lte('due_date', to),
    supabase.from('content_posts').select('id, title, network, publish_date, status').eq('workspace_id', wid).gte('publish_date', from).lte('publish_date', to),
    supabase.from('projects').select('id, name, due_date').eq('workspace_id', wid).in('status', ['planejado', 'em_andamento']).gte('due_date', from).lte('due_date', to),
    supabase.from('proposals').select('id, title, valid_until').eq('workspace_id', wid).in('status', ['enviada', 'visualizada', 'em_negociacao']).gte('valid_until', from).lte('valid_until', to),
    supabase.from('leads').select('id, name, next_action, next_action_at').eq('workspace_id', wid).not('next_action_at', 'is', null).gte('next_action_at', `${from}T00:00:00-03:00`).lte('next_action_at', `${to}T23:59:59-03:00`),
    isAdmin ? supabase.from('fin_transactions').select('id, description, direction, due_date').eq('workspace_id', wid).eq('status', 'previsto').gte('due_date', from).lte('due_date', to) : Promise.resolve({ data: [] as { id: string; description: string; direction: string; due_date: string }[] }),
  ]);
  const items: Item[] = [
    ...(tasks.data ?? []).map((t): Item => ({ date: t.due_date!, label: t.title, href: '/tarefas', kind: 'tarefa', late: t.due_date! < today })),
    ...(posts.data ?? []).map((p): Item => ({ date: p.publish_date!, label: `${NETWORKS[p.network]?.label ?? p.network}: ${p.title}`, href: `/conteudo/${p.id}`, kind: 'post', late: p.status !== 'publicado' && p.publish_date! < today })),
    ...(projects.data ?? []).map((p): Item => ({ date: p.due_date!, label: `Entrega: ${p.name}`, href: `/projetos/${p.id}`, kind: 'projeto', late: p.due_date! < today })),
    ...(props.data ?? []).map((p): Item => ({ date: p.valid_until!, label: `Vence: ${p.title}`, href: `/propostas/${p.id}`, kind: 'proposta' })),
    ...(leads.data ?? []).map((l): Item => ({ date: new Date(l.next_action_at!).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }), label: `${l.next_action ?? 'Contato'} — ${l.name}`, href: `/crm/${l.id}`, kind: 'lead' })),
    ...(fin.data ?? []).map((t): Item => ({ date: t.due_date, label: `${t.direction === 'in' ? 'Receber' : 'Pagar'}: ${t.description}`, href: '/financeiro', kind: 'financeiro', late: t.due_date < today })),
  ];
  const byDay = new Map<string, Item[]>();
  items.forEach((i) => byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]));
  const overdue = items.filter((i) => i.late).sort((a, b) => a.date.localeCompare(b.date));
  const next7 = items.filter((i) => i.date >= today && i.date <= addDays(today, 7)).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <PageHeader title="Agenda e prazos" subtitle="Tarefas, publicações, entregas, vencimentos e follow-ups num só calendário." actions={<MonthNav base="/agenda" ym={ym} label={`${MONTHS_PT[mo - 1]} ${y}`} />} />
      <div className="mb-4 flex flex-wrap gap-2 text-xs">{(Object.keys(KIND) as Item['kind'][]).map((k) => <span key={k} className={`badge border-transparent ${KIND[k]}`}>{KIND_LABEL[k]}</span>)}</div>
      <div className="overflow-x-auto"><div className="min-w-[760px] overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-subtle/50 text-center text-xs font-medium uppercase tracking-wider text-muted">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        {weeks.map((w, wi) => (
          <div key={wi} className="grid grid-cols-7 divide-x divide-line border-b border-line last:border-b-0">
            {w.map((c) => {
              const list = byDay.get(c.date) ?? [];
              return (
                <div key={c.date} className={`min-h-28 p-1.5 ${c.inMonth ? '' : 'bg-subtle/40 text-muted'} ${c.date === today ? 'bg-accent/5' : ''}`}>
                  <div className={`mb-1 text-right text-xs ${c.date === today ? 'font-bold text-accent-ink' : 'text-muted'}`}>{pad2(Number(c.date.slice(8)))}</div>
                  <div className="space-y-1">
                    {list.slice(0, 4).map((i, n) => <Link key={n} href={i.href} title={i.label} className={`block truncate rounded px-1.5 py-0.5 text-[11px] ${KIND[i.kind]} ${i.late ? 'ring-1 ring-danger' : ''}`}>{i.label}</Link>)}
                    {list.length > 4 && <div className="px-1 text-[11px] text-muted">+{list.length - 4}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={`Atrasados (${overdue.length})`}>{!overdue.length ? <p className="text-sm text-muted">Nada atrasado neste período. 👏</p> : <ul className="space-y-2 text-sm">{overdue.map((i, n) => <li key={n}><Link href={i.href} className="hover:underline"><span className="text-danger">{dateBR(i.date)}</span> · {i.label}</Link></li>)}</ul>}</Section>
        <Section title="Próximos 7 dias">{!next7.length ? <p className="text-sm text-muted">Nada agendado.</p> : <ul className="space-y-2 text-sm">{next7.map((i, n) => <li key={n}><Link href={i.href} className="hover:underline"><span className="text-muted">{dateBR(i.date)}</span> · {i.label}</Link></li>)}</ul>}</Section>
      </div>
    </>
  );
}
