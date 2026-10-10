import { requireWorkspace } from '@/lib/session';
import { PageHeader, Section, Empty } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TASK_STATUS } from '@/lib/domain';
import { TaskCard, TaskFields } from '@/components/TaskParts';
import { createTask } from './actions';
import Link from 'next/link';

export const metadata = { title: 'Tarefas' };

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ who?: string; project?: string; done?: string }> }) {
  const { supabase, ws, user, open } = await requireWorkspace('tarefas');
  const sp = await searchParams;
  let q = supabase.from('tasks').select('id, title, description, status, priority, due_date, project_id, client_id, assignee_id').eq('workspace_id', ws.id).order('due_date', { nullsFirst: false }).limit(500);
  if (sp.who === 'me') q = q.eq('assignee_id', user.id);
  if (sp.project) q = q.eq('project_id', sp.project);
  if (!sp.done) q = q.neq('status', 'feito');
  const [{ data: tasks }, { data: projects }, { data: clients }, { data: members }] = await Promise.all([
    q,
    supabase.from('projects').select('id, name').eq('workspace_id', ws.id).in('status', ['planejado', 'em_andamento', 'pausado']).order('name'),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
  ]);
  const mem = (members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }));
  const pn = new Map((projects ?? []).map((p) => [p.id, p.name])), cn = new Map((clients ?? []).map((c) => [c.id, c.name])), mn = new Map(mem.map((m) => [m.id, m.name]));
  const cols = TASK_STATUS.filter((s) => sp.done || s.key !== 'feito');
  const lnk = (extra: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]); return `/tarefas${p.size ? `?${p}` : ''}`; };

  return (
    <>
      <PageHeader title="Tarefas" subtitle="O que precisa sair, para quem e até quando." actions={<>
        <Link href={lnk({ who: sp.who === 'me' ? undefined : 'me' })} className={`btn btn-sm ${sp.who === 'me' ? 'btn-dark' : ''}`}>Só minhas</Link>
        <Link href={lnk({ done: sp.done ? undefined : '1' })} className={`btn btn-sm ${sp.done ? 'btn-dark' : ''}`}>Mostrar concluídas</Link></>} />
      {open && (
        <details className="card mb-6 !p-4"><summary className="cursor-pointer text-sm font-medium">+ Nova tarefa</summary>
          <form action={createTask.bind(null, '/tarefas')} className="mt-4 space-y-3"><TaskFields projects={projects ?? []} clients={clients ?? []} members={mem} /><SubmitButton pendingText="…">Criar tarefa</SubmitButton></form></details>
      )}
      {!tasks?.length && !sp.done ? <Empty title="Nada pendente 🎉" text="Crie tarefas para entregas, revisões, follow-ups e o que mais precisar de prazo." /> : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {cols.map((c) => {
            const items = (tasks ?? []).filter((t) => t.status === c.key);
            return (
              <section key={c.key} className="w-80 shrink-0 rounded-2xl border border-line bg-subtle/50 p-3">
                <header className="mb-3 flex justify-between px-1.5"><h3 className="text-sm font-semibold">{c.label}</h3><span className="text-xs text-muted">{items.length}</span></header>
                <div className="space-y-2.5">
                  {items.map((t) => <TaskCard key={t.id} t={t} back={lnk({})} canEdit={open} projects={projects ?? []} clients={clients ?? []} members={mem} projectName={t.project_id ? pn.get(t.project_id) : undefined} clientName={t.client_id ? cn.get(t.client_id) : undefined} assigneeName={t.assignee_id ? mn.get(t.assignee_id) : undefined} />)}
                  {!items.length && <p className="px-1.5 py-6 text-center text-xs text-muted">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Section title="Dica"><p className="text-sm text-muted">Tarefas atrasadas geram alertas automáticos para o responsável. Os prazos também aparecem na <Link href="/agenda" className="underline">Agenda</Link>.</p></Section>
    </>
  );
}
