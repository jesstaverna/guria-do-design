import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, PageHeader, Stat } from '@/components/ui';
import { PROPOSAL_STATUS } from '@/lib/domain';
import { dateBR, money } from '@/lib/format';

export const metadata = { title: 'Propostas' };

export default async function Propostas({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('propostas');
  const { status } = await searchParams;
  let q = supabase.from('proposals').select('id, number, title, status, total_cents, valid_until, created_at, client:clients(name), lead:leads(name)').eq('workspace_id', ws.id).order('number', { ascending: false }).limit(300);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  const all = data ?? [];
  const openVal = all.filter((p) => ['enviada', 'visualizada', 'em_negociacao'].includes(p.status)).reduce((s, p) => s + Number(p.total_cents), 0);
  const won = all.filter((p) => p.status === 'aceita');
  return (
    <>
      <PageHeader title="Propostas" subtitle="Crie, envie por link e acompanhe visualização e aceite." actions={open && <Link href="/propostas/nova" className="btn btn-primary">Nova proposta</Link>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Em negociação" value={money(openVal)} />
        <Stat label="Aceitas" value={won.length} hint={money(won.reduce((s, p) => s + Number(p.total_cents), 0))} tone="ok" />
        <Stat label="Taxa de aceite" value={all.length ? `${Math.round((won.length / Math.max(all.filter((p) => p.status !== 'rascunho').length, 1)) * 100)}%` : '—'} hint="aceitas ÷ enviadas" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/propostas" className={`btn btn-sm ${!status ? 'btn-dark' : ''}`}>Todas</Link>
        {Object.entries(PROPOSAL_STATUS).map(([k, v]) => <Link key={k} href={`/propostas?status=${k}`} className={`btn btn-sm ${status === k ? 'btn-dark' : ''}`}>{v.label}</Link>)}
      </div>
      {!all.length ? <Empty title="Nenhuma proposta" text="Comece por um modelo (identidade visual, social media, landing page, tráfego…)." action={open && <Link href="/propostas/nova" className="btn btn-primary">Criar proposta</Link>} /> : (
        <div className="table-wrap"><table className="w-full">
          <thead><tr><th className="th">Nº</th><th className="th">Proposta</th><th className="th">Para</th><th className="th">Valor</th><th className="th">Validade</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{all.map((p) => {
            const who = (p.client as unknown as { name: string } | null)?.name ?? (p.lead as unknown as { name: string } | null)?.name ?? '—';
            return (<tr key={p.id} className="hover:bg-subtle/50"><td className="td text-muted">#{p.number}</td><td className="td"><Link href={`/propostas/${p.id}`} className="font-medium hover:underline">{p.title}</Link></td><td className="td text-muted">{who}</td><td className="td">{money(p.total_cents)}</td><td className="td text-muted">{dateBR(p.valid_until)}</td><td className="td"><Badge tone={PROPOSAL_STATUS[p.status]?.tone}>{PROPOSAL_STATUS[p.status]?.label}</Badge></td></tr>);
          })}</tbody>
        </table></div>
      )}
    </>
  );
}
