import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Field, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TaskCard, TaskFields } from '@/components/TaskParts';
import { createTask } from '../../tarefas/actions';
import { updateProject } from '../actions';
import { TASK_STATUS } from '@/lib/domain';

export const metadata = { title: 'Projeto' };

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, open } = await requireWorkspace('projetos');
  const { data: p } = await supabase.from('projects').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const [{ data: tasks }, { data: clients }, { data: members }] = await Promise.all([
    supabase.from('tasks').select('id, title, description, status, priority, due_date, project_id, client_id, assignee_id').eq('project_id', id).order('due_date', { nullsFirst: false }),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
  ]);
  const mem = (members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }));
  const back = `/projetos/${id}`;
  const thisProject = [{ id, name: p.name }];
  return (
    <>
      <PageHeader title={p.name} subtitle={`${tasks?.filter((t) => t.status === 'feito').length ?? 0}/${tasks?.length ?? 0} tarefas concluídas`} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Tarefas">
            {open && (
              <details className="mb-4 rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">+ Nova tarefa neste projeto</summary>
                <form action={createTask.bind(null, back)} className="mt-3 space-y-3">
                  <input type="hidden" name="project_id" value={id} /><input type="hidden" name="client_id" value={p.client_id ?? ''} />
                  <div className="grid gap-3 sm:grid-cols-3"><Field label="Tarefa *" className="sm:col-span-3"><input name="title" required className="input" /></Field>
                    <Field label="Prazo"><input name="due_date" type="date" className="input" /></Field>
                    <Field label="Responsável"><select name="assignee_id" className="input"><option value="">—</option>{mem.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
                    <Field label="Prioridade"><select name="priority" defaultValue="media" className="input"><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></Field></div>
                  <SubmitButton className="btn btn-sm" pendingText="…">Adicionar</SubmitButton>
                </form></details>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {TASK_STATUS.map((s) => (
                <div key={s.key}><div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{s.label}</div>
                  <div className="space-y-2.5">{tasks?.filter((t) => t.status === s.key).map((t) => <TaskCard key={t.id} t={t} back={back} canEdit={open} projects={thisProject} clients={clients ?? []} members={mem} assigneeName={mem.find((m) => m.id === t.assignee_id)?.name} />)}</div></div>
              ))}
            </div>
          </Section>
        </div>
        <form action={updateProject.bind(null, id)} className="card h-fit space-y-4">
          <fieldset disabled={!open} className="space-y-4">
            <Field label="Nome"><input name="name" required defaultValue={p.name} className="input" /></Field>
            <Field label="Cliente"><select name="client_id" defaultValue={p.client_id ?? ''} className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Status"><select name="status" defaultValue={p.status} className="input"><option value="planejado">Planejado</option><option value="em_andamento">Em andamento</option><option value="pausado">Pausado</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Início"><input name="start_date" type="date" defaultValue={p.start_date ?? ''} className="input" /></Field><Field label="Prazo"><input name="due_date" type="date" defaultValue={p.due_date ?? ''} className="input" /></Field></div>
            <Field label="Descrição"><textarea name="description" rows={4} defaultValue={p.description ?? ''} className="input" /></Field>
            <SubmitButton>Salvar projeto</SubmitButton>
          </fieldset>
        </form>
      </div>
    </>
  );
}
