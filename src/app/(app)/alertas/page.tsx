import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { requireWorkspace } from '@/lib/session';
import { PageHeader, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Alertas' };

async function markAllRead() {
  'use server';
  const { supabase, ws } = await requireWorkspace();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('workspace_id', ws.id).is('read_at', null);
  revalidatePath('/alertas');
}
async function markRead(id: string) {
  'use server';
  const { supabase, ws } = await requireWorkspace();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('workspace_id', ws.id).eq('id', id);
  revalidatePath('/alertas');
}

const TONE = { critical: 'border-l-danger', warning: 'border-l-warn', info: 'border-l-violet-brand' } as const;

export default async function Alertas() {
  const { supabase, ws } = await requireWorkspace();
  const { data } = await supabase.from('notifications').select('id, severity, title, body, link, read_at, created_at').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <>
      <PageHeader title="Alertas" subtitle="Atrasos, aceites, prazos e avisos gerados automaticamente." actions={unread > 0 && <form action={markAllRead}><SubmitButton className="btn btn-sm" pendingText="…">Marcar todos como lidos</SubmitButton></form>} />
      {!data?.length ? <Empty title="Nenhum alerta por enquanto" text="Quando algo precisar de atenção — pagamento atrasado, proposta aceita, tarefa vencida — aparece aqui." /> : (
        <ul className="space-y-2.5">
          {data.map((n) => (
            <li key={n.id} className={`card flex items-start justify-between gap-4 border-l-4 !p-4 ${TONE[n.severity as keyof typeof TONE]} ${n.read_at ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className="text-sm font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</div>
                {n.body && <div className="mt-0.5 text-sm text-muted">{n.body}</div>}
                <div className="mt-1 text-xs text-muted">{dateTimeBR(n.created_at)}</div>
              </div>
              {!n.read_at && <form action={markRead.bind(null, n.id)}><SubmitButton className="btn btn-sm" pendingText="…">Lido</SubmitButton></form>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
