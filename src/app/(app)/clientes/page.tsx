import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Empty, PageHeader, Badge } from '@/components/ui';

export const metadata = { title: 'Clientes' };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { supabase, ws } = await requireWorkspace('clientes');
  const { q, status } = await searchParams;
  let query = supabase.from('clients').select('id, name, company, email, phone, segment, status, created_at').eq('workspace_id', ws.id).order('name').limit(500);
  if (status) query = query.eq('status', status);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, ' ')}%,company.ilike.%${q.replace(/[%,()]/g, ' ')}%`);
  const { data } = await query;
  return (
    <>
      <PageHeader title="Clientes" subtitle="Todos os clientes do estúdio num só cadastro." actions={<Link href="/clientes/novo" className="btn btn-primary">Novo cliente</Link>} />
      <form className="mb-5 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nome ou empresa" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ''} className="input w-auto"><option value="">Todos</option><option value="ativo">Ativos</option><option value="pausado">Pausados</option><option value="encerrado">Encerrados</option></select>
        <button className="btn">Filtrar</button>
      </form>
      {!data?.length ? <Empty title="Nenhum cliente ainda" text="Clientes são criados ao aceitar uma proposta, ao converter um lead ou manualmente." action={<Link href="/clientes/novo" className="btn btn-primary">Cadastrar cliente</Link>} /> : (
        <div className="table-wrap"><table className="w-full">
          <thead><tr><th className="th">Cliente</th><th className="th">Contato</th><th className="th">Segmento</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.map((c) => (
              <tr key={c.id} className="hover:bg-subtle/50">
                <td className="td"><Link href={`/clientes/${c.id}`} className="font-medium hover:underline">{c.name}</Link>{c.company && <div className="text-xs text-muted">{c.company}</div>}</td>
                <td className="td text-muted">{c.email ?? c.phone ?? '—'}</td>
                <td className="td text-muted">{c.segment ?? '—'}</td>
                <td className="td"><Badge tone={c.status === 'ativo' ? 'bg-ok/15 text-ok' : undefined}>{c.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
