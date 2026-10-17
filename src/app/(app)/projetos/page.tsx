import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, Field, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { ProgressBar } from '@/components/Charts';
import { todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';
import { createProject } from './actions';

export const metadata = { title: 'Projetos' };

const LABEL: Record<string, string> = { planejado: 'Planejado', em_andamento: 'Em andamento', pausado: 'Pausado', concluido: 'Concluído', cancelado: 'Cancelado' };

export default async function Projetos({ searchParams }: { searchParams: Promise<{ client?: string; all?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('projetos');
  const sp = await searchParams;
  let q = supabase.from('projects').select('id, name, status, due_date, client:clients(name)').eq('workspace_id', ws.id).order('due_date', { nullsFirst: false }).limit(300);
  if (sp.client) q = q.eq('client_id', sp.client);
  if (!sp.all) q = q.in('status', ['planejado', 'em_andamento', 'pausado']);
  const [{ data: projects }, { data: tasks }, { data: clients }] = await Promise.all([
    q,
    supabase.from('tasks').select('project_id, status').eq('workspace_id', ws.id).not('project_id', 'is', null).limit(5000),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
  ]);
  const prog = new Map<string, { done: number; total: number }>();
  (tasks ?? []).forEach((t) => { const p = prog.get(t.project_id!) ?? { done: 0, total: 0 }; p.total++; if (t.status === 'feito') p.done++; prog.set(t.project_id!, p); });
  return (
    <>
      <PageHeader title="Projetos" subtitle="Cada trabalho vendido vira um projeto com tarefas e prazo." actions={<><Link href="/projetos/modelos" className="btn btn-sm">Modelos de onboarding</Link><Link href={sp.all ? '/projetos' : '/projetos?all=1'} className="btn btn-sm">{sp.all ? 'Só ativos' : 'Incluir concluídos'}</Link></>} />
      {open && (
        <details className="card mb-6 !p-4"><summary className="cursor-pointer text-sm font-medium">+ Novo projeto</summary>
          <form action={createProject} className="mt-4 grid gap-3 sm:grid-cols-4">
            <Field label="Nome *" className="sm:col-span-2"><input name="name" required className="input" /></Field>
            <Field label="Cliente"><select name="client_id" defaultValue={sp.client ?? ''} className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Prazo final"><input name="due_date" type="date" className="input" /></Field>
            <div className="sm:col-span-4"><SubmitButton pendingText="…">Criar projeto</SubmitButton></div>
          </form></details>
      )}
      {!projects?.length ? <Empty title="Nenhum projeto" text="Projetos são criados ao ativar uma proposta aceita ou manualmente." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const g = prog.get(p.id) ?? { done: 0, total: 0 };
            const late = p.due_date && p.due_date < todayBR() && ['planejado', 'em_andamento'].includes(p.status);
            return (
              <Link key={p.id} href={`/projetos/${p.id}`} className="card block transition hover:border-accent">
                <div className="flex items-start justify-between gap-2"><h3 className="font-medium">{p.name}</h3><Badge>{LABEL[p.status]}</Badge></div>
                <div className="mt-1 text-xs text-muted">{(p.client as unknown as { name: string } | null)?.name ?? 'Sem cliente'}</div>
                <div className="mt-4"><ProgressBar value={g.total ? (g.done / g.total) * 100 : 0} /><div className="mt-1.5 text-xs text-muted">{g.done}/{g.total} tarefas</div></div>
                <div className={`mt-3 text-xs ${late ? 'font-medium text-danger' : 'text-muted'}`}>Prazo: {dateBR(p.due_date)}{late ? ' (atrasado)' : ''}</div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
