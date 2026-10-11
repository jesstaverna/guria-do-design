import Link from 'next/link';
import { Field, Badge } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { AutoSelect } from '@/components/AutoSelect';
import { PRIORITY, TASK_STATUS, todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';
import { deleteTask, setTaskStatus, updateTask } from '@/app/(app)/tarefas/actions';

export interface TaskRow { id: string; title: string; description: string | null; status: string; priority: string; due_date: string | null; project_id: string | null; client_id: string | null; assignee_id: string | null }
export interface Opt { id: string; name: string }

export function TaskFields({ t, projects, clients, members }: { t?: Partial<TaskRow>; projects: Opt[]; clients: Opt[]; members: Opt[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Tarefa *" className="sm:col-span-2"><input name="title" required defaultValue={t?.title} className="input" /></Field>
      <Field label="Prazo"><input name="due_date" type="date" defaultValue={t?.due_date ?? ''} className="input" /></Field>
      <Field label="Prioridade"><select name="priority" defaultValue={t?.priority ?? 'media'} className="input">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="Responsável"><select name="assignee_id" defaultValue={t?.assignee_id ?? ''} className="input"><option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Status"><select name="status" defaultValue={t?.status ?? 'a_fazer'} className="input">{TASK_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      <Field label="Projeto"><select name="project_id" defaultValue={t?.project_id ?? ''} className="input"><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Cliente"><select name="client_id" defaultValue={t?.client_id ?? ''} className="input"><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Detalhes" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={t?.description ?? ''} className="input" /></Field>
    </div>
  );
}

export function TaskCard({ t, back, canEdit, projects, clients, members, projectName, clientName, assigneeName, attachments = 0 }: {
  t: TaskRow; back: string; canEdit: boolean; projects: Opt[]; clients: Opt[]; members: Opt[]; projectName?: string; clientName?: string; assigneeName?: string; attachments?: number;
}) {
  const late = t.status !== 'feito' && t.due_date && t.due_date < todayBR();
  return (
    <article className={`rounded-xl border bg-surface p-3.5 ${late ? 'border-danger/50' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/tarefas/${t.id}`} className={`text-sm font-medium hover:underline ${t.status === 'feito' ? 'text-muted line-through' : ''}`}>{t.title}</Link>
        <Badge tone={PRIORITY[t.priority]?.tone}>{PRIORITY[t.priority]?.label}</Badge>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted">
        {t.due_date && <span className={late ? 'font-medium text-danger' : ''}>⏱ {dateBR(t.due_date)}{late ? ' (atrasada)' : ''}</span>}
        {attachments > 0 && <span title="Anexos">📎 {attachments}</span>}{projectName && <span>📁 {projectName}</span>}{clientName && <span>👤 {clientName}</span>}{assigneeName && <span>→ {assigneeName}</span>}
      </div>
      {canEdit && (
        <div className="mt-2.5 space-y-2">
          <AutoSelect action={setTaskStatus.bind(null, t.id)} defaultValue={t.status} label={`Status de ${t.title}`} options={TASK_STATUS.map((s) => ({ value: s.key, label: s.label }))} />
          <details className="text-xs">
            <summary className="cursor-pointer text-muted hover:text-fg">Editar</summary>
            <form action={updateTask.bind(null, back, t.id)} className="mt-3 space-y-3"><TaskFields t={t} projects={projects} clients={clients} members={members} /><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form>
            <form action={deleteTask.bind(null, back, t.id)} className="mt-2"><SubmitButton className="text-danger underline" pendingText="…" confirm="Excluir esta tarefa?">Excluir</SubmitButton></form>
          </details>
        </div>
      )}
    </article>
  );
}
