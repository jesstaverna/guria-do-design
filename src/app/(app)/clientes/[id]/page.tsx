import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, PageHeader, Section, Stat } from '@/components/ui';
import { CONTRACT_STATUS, NETWORKS, PROPOSAL_STATUS } from '@/lib/domain';
import { dateBR, money } from '@/lib/format';
import { ClientForm } from '../ClientForm';
import { updateClientAction } from '../actions';

export const metadata = { title: 'Cliente' };

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, isAdmin } = await requireWorkspace('clientes');
  const { data: c } = await supabase.from('clients').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!c) notFound();
  const [props, cons, projs, tasks, posts, camps, fin] = await Promise.all([
    supabase.from('proposals').select('id, number, title, status, total_cents').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('contracts').select('id, number, title, status').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name, status, due_date').eq('client_id', id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, title, due_date, status').eq('client_id', id).neq('status', 'feito').order('due_date', { nullsFirst: false }).limit(10),
    supabase.from('content_posts').select('id, title, network, status, publish_date').eq('client_id', id).order('publish_date', { ascending: false, nullsFirst: false }).limit(8),
    supabase.from('ad_campaigns').select('id, name, status, platform').eq('client_id', id),
    isAdmin ? supabase.from('fin_transactions').select('direction, amount_cents, status').eq('client_id', id) : Promise.resolve({ data: [] as { direction: string; amount_cents: number; status: string }[] }),
  ]);
  const received = (fin.data ?? []).filter((t) => t.direction === 'in' && t.status === 'pago').reduce((s, t) => s + Number(t.amount_cents), 0);
  const open = (fin.data ?? []).filter((t) => t.direction === 'in' && t.status === 'previsto').reduce((s, t) => s + Number(t.amount_cents), 0);

  return (
    <>
      <PageHeader title={c.name} subtitle={[c.company, c.segment].filter(Boolean).join(' · ') || undefined}
        actions={<><Link href={`/propostas/nova?client=${id}`} className="btn">Nova proposta</Link><Link href={`/contratos/novo?client=${id}`} className="btn">Novo contrato</Link><Link href={`/projetos?client=${id}`} className="btn">Projetos</Link></>} />
      {isAdmin && <div className="mb-6 grid gap-4 sm:grid-cols-3"><Stat label="Recebido" value={money(received)} tone="ok" /><Stat label="A receber" value={money(open)} /><Stat label="Propostas" value={props.data?.length ?? 0} /></div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2"><ClientForm action={updateClientAction.bind(null, id)} c={c} /></div>
        <div className="space-y-6">
          <Section title="Propostas">{!props.data?.length ? <p className="text-sm text-muted">Nenhuma proposta.</p> : <ul className="space-y-2 text-sm">{props.data.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link href={`/propostas/${p.id}`} className="hover:underline">#{p.number} {p.title}</Link><Badge tone={PROPOSAL_STATUS[p.status]?.tone}>{PROPOSAL_STATUS[p.status]?.label}</Badge></li>)}</ul>}</Section>
          <Section title="Contratos">{!cons.data?.length ? <p className="text-sm text-muted">Nenhum contrato.</p> : <ul className="space-y-2 text-sm">{cons.data.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link href={`/contratos/${p.id}`} className="hover:underline">#{p.number} {p.title}</Link><Badge tone={CONTRACT_STATUS[p.status]?.tone}>{CONTRACT_STATUS[p.status]?.label}</Badge></li>)}</ul>}</Section>
          <Section title="Projetos e tarefas abertas">
            {!projs.data?.length && !tasks.data?.length ? <p className="text-sm text-muted">Nada em andamento.</p> : <ul className="space-y-2 text-sm">
              {projs.data?.map((p) => <li key={p.id}><Link href={`/projetos/${p.id}`} className="font-medium hover:underline">{p.name}</Link> <span className="text-muted">· {p.status.replace('_', ' ')}</span></li>)}
              {tasks.data?.map((t) => <li key={t.id} className="text-muted">{t.title} · {dateBR(t.due_date)}</li>)}
            </ul>}
          </Section>
          <Section title="Conteúdo e tráfego">
            {!posts.data?.length && !camps.data?.length ? <p className="text-sm text-muted">Sem conteúdo ou campanhas.</p> : <ul className="space-y-2 text-sm">
              {posts.data?.map((p) => <li key={p.id} className="text-muted"><Link href={`/conteudo/${p.id}`} className="text-fg hover:underline">{p.title}</Link> · {NETWORKS[p.network]?.label} · {dateBR(p.publish_date)}</li>)}
              {camps.data?.map((p) => <li key={p.id}><Link href={`/trafego/${p.id}`} className="hover:underline">{p.name}</Link> <span className="text-muted">· {p.status}</span></li>)}
            </ul>}
          </Section>
        </div>
      </div>
      {!props.data?.length && !cons.data?.length && !projs.data?.length && <div className="mt-6"><Empty title="Ainda sem histórico" text="Crie uma proposta para este cliente e acompanhe tudo aqui." /></div>}
    </>
  );
}
