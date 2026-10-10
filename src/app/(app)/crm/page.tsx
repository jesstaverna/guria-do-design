import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Empty, PageHeader, Stat } from '@/components/ui';
import { daysSince, money } from '@/lib/format';
import { KanbanBoard, type KStage } from './KanbanBoard';

export const metadata = { title: 'CRM' };

export default async function Crm({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('crm');
  const { view } = await searchParams;
  const [{ data: stages }, { data: leads }, { data: members }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name, kind, probability').eq('workspace_id', ws.id).order('position'),
    supabase.from('leads').select('id, name, company, potential_value_cents, stage_id, owner_id, last_contact_at, phone, email, created_at').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(1000),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
  ]);
  const names = new Map((members ?? []).map((m) => [m.user_id, (m.profile as unknown as { full_name: string } | null)?.full_name ?? '']));
  const kind = new Map((stages ?? []).map((s) => [s.id, s]));
  const rows = (leads ?? []).map((l) => {
    const st = kind.get(l.stage_id);
    const d = daysSince(l.last_contact_at) ?? 0;
    return { ...l, owner: l.owner_id ? names.get(l.owner_id) ?? null : null, daysSinceContact: d, stale: d >= 3, stageKind: st?.kind, prob: st?.probability ?? 0 };
  });
  const openLeads = rows.filter((l) => l.stageKind === 'open');
  const pipeline = openLeads.reduce((s, l) => s + Number(l.potential_value_cents), 0);
  const weighted = openLeads.reduce((s, l) => s + (Number(l.potential_value_cents) * l.prob) / 100, 0);

  return (
    <>
      <PageHeader title="CRM" subtitle="Seu funil de vendas: do primeiro contato ao fechamento." actions={<>
        <Link href={view === 'lista' ? '/crm' : '/crm?view=lista'} className="btn">{view === 'lista' ? 'Ver Kanban' : 'Ver lista'}</Link>
        {open && <Link href="/crm/novo" className="btn btn-primary">Novo lead</Link>}</>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Leads em aberto" value={openLeads.length} />
        <Stat label="Pipeline" value={money(pipeline)} />
        <Stat label="Pipeline ponderado" value={money(weighted)} hint="valor × probabilidade da etapa (edite no banco)" />
      </div>
      {!rows.length ? <Empty title="Nenhum lead ainda" text="Cadastre seus contatos e arraste entre as etapas conforme a conversa avança." action={open && <Link href="/crm/novo" className="btn btn-primary">Cadastrar o primeiro lead</Link>} />
        : view === 'lista' ? (
          <div className="table-wrap"><table className="w-full">
            <thead><tr><th className="th">Lead</th><th className="th">Etapa</th><th className="th">Valor</th><th className="th">Último contato</th></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((l) => (
              <tr key={l.id}><td className="td"><Link href={`/crm/${l.id}`} className="font-medium hover:underline">{l.name}</Link>{l.company && <div className="text-xs text-muted">{l.company}</div>}</td>
                <td className="td text-muted">{kind.get(l.stage_id)?.name}</td><td className="td">{money(l.potential_value_cents)}</td><td className="td text-muted">há {l.daysSinceContact} dia(s)</td></tr>))}</tbody>
          </table></div>
        ) : <KanbanBoard canEdit={open} stages={(stages ?? []) as KStage[]} leads={rows.map((l) => ({ id: l.id, name: l.name, company: l.company, potential_value_cents: l.potential_value_cents, owner: l.owner, stage_id: l.stage_id, daysSinceContact: l.daysSinceContact, stale: l.stale }))} />}
    </>
  );
}
