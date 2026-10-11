import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { PageHeader, Section, Empty, Badge } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { AutoSelect } from '@/components/AutoSelect';
import { PRIORITY, TASK_STATUS, todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';
import { TaskCard, TaskFields } from '@/components/TaskParts';
import { createTask, setTaskStatus } from './actions';

export const metadata = { title: 'Tarefas' };

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ who?: string; project?: string; done?: string; view?: string }> }) {
  const { supabase, ws, user, open } = await requireWorkspace('tarefas');
  const sp = await searchParams;
  const view = sp.view === 'lista' ? 'lista' : 'quadro';
  let q = supabase.from('tasks').select('id, title, description, status, priority, due_date, project_id, client_id, assignee_id').eq('workspace_id', ws.id).order('due_date', { nullsFirst: false }).limit(500);
  if (sp.who === 'me') q = q.eq('assignee_id', user.id);
  if (sp.project) q = q.eq('project_id', sp.project);
  if (!sp.done) q = q.neq('status', 'feito');
  const [{ data: tasks }, { data: projects }, { data: clients }, { data: members }, { data: atts }] = await Promise.all([
    q,
    supabase.from('projects').select('id, name').eq('workspace_id', ws.id).in('status', ['planejado', 'em_andamento', 'pausado']).order('name'),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
    supabase.from('task_attachments').select('task_id').eq('workspace_id', ws.id).limit(5000),
  ]);
  const mem = (members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }));
  const pn = new Map((projects ?? []).map((p) => [p.id, p.name])), cn = new Map((clients ?? []).map((c) => [c.id, c.name])), mn = new Map(mem.map((m) => [m.id, m.name]));
  const na = new Map<string, number>(); (atts ?? []).forEach((a) => na.set(a.task_id, (na.get(a.task_id) ?? 0) + 1));
  const cols = TASK_STATUS.filter((s) => sp.done || s.key !== 'feito');
  const lnk = (extra: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]); return `/tarefas${p.size ? `?${p}` : ''}`; };
  const today = todayBR();

  return (
    <>
      <PageHeader title="Tarefas" subtitle="O que precisa sair, para quem e até quando." actions={<>
        <div className="flex overflow-hidden rounded-xl border border-line" role="group" aria-label="Modo de visualização">
          <Link href={lnk({ view: undefined })} aria-current={view === 'quadro'} className={`px-3 py-1.5 text-xs ${view === 'quadro' ? 'bg-fg text-bg' : 'bg-surface'}`}>Kanban</Link>
          <Link href={lnk({ view: 'lista' })} aria-current={view === 'lista'} className={`px-3 py-1.5 text-xs ${view === 'lista' ? 'bg-fg text-bg' : 'bg-surface'}`}>Lista</Link>
        </div>
        <Link href={lnk({ who: sp.who === 'me' ? undefined : 'me' })} className={`btn btn-sm ${sp.who === 'me' ? 'btn-dark' : ''}`}>Só minhas</Link>
        <Link href={lnk({ done: sp.done ? undefined : '1' })} className={`btn btn-sm ${sp.done ? 'btn-dark' : ''}`}>Mostrar concluídas</Link></>} />
      {open && (
        <details className="card mb-6 !p-4"><summary className="cursor-pointer text-sm font-medium">+ Nova tarefa</summary>
          <form action={createTask.bind(null, lnk({}))} className="mt-4 space-y-3"><TaskFields projects={projects ?? []} clients={clients ?? []} members={mem} /><SubmitButton pendingText="…">Criar tarefa</SubmitButton></form></details>
      )}
      {!tasks?.length && !sp.done ? <Empty title="Nada pendente 🎉" text="Crie tarefas para entregas, revisões, follow-ups e o que mais precisar de prazo." /> : view === 'lista' ? (
        <div className="table-wrap mb-6"><table className="w-full">
          <thead><tr><th className="th">Tarefa</th><th className="th">Projeto / cliente</th><th className="th">Responsável</th><th className="th">Prazo</th><th className="th">Prioridade</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{(tasks ?? []).map((t) => {
            const late = t.status !== 'feito' && t.due_date && t.due_date < today;
            return (
              <tr key={t.id} className="hover:bg-subtle/50">
                <td className="td"><Link href={`/tarefas/${t.id}`} className={`font-medium hover:underline ${t.status === 'feito' ? 'text-muted line-through' : ''}`}>{t.title}</Link>{!!na.get(t.id) && <span className="ml-2 text-xs text-muted" title="Anexos">📎 {na.get(t.id)}</span>}</td>
                <td className="td text-muted">{[t.project_id && pn.get(t.project_id), t.client_id && cn.get(t.client_id)].filter(Boolean).join(' · ') || '—'}</td>
                <td className="td text-muted">{t.assignee_id ? mn.get(t.assignee_id) ?? '—' : '—'}</td>
                <td className={`td ${late ? 'font-medium text-danger' : 'text-muted'}`}>{dateBR(t.due_date)}{late ? ' (atrasada)' : ''}</td>
                <td className="td"><Badge tone={PRIORITY[t.priority]?.tone}>{PRIORITY[t.priority]?.label}</Badge></td>
                <td className="td w-40">{open ? <AutoSelect action={setTaskStatus.bind(null, t.id)} defaultValue={t.status} label={`Status de ${t.title}`} options={TASK_STATUS.map((s) => ({ value: s.key, label: s.label }))} /> : TASK_STATUS.find((s) => s.key === t.status)?.label}</td>
              </tr>
            );
          })}</tbody></table></div>
      ) : (
        <div className="mb-6 flex gap-4 overflow-x-auto pb-4">
          {cols.map((c) => {
            const items = (tasks ?? []).filter((t) => t.status === c.key);
            return (
              <section key={c.key} className="w-80 shrink-0 rounded-2xl border border-line bg-subtle/50 p-3">
                <header className="mb-3 flex justify-between px-1.5"><h3 className="text-sm font-semibold">{c.label}</h3><span className="text-xs text-muted">{items.length}</span></header>
                <div className="space-y-2.5">
                  {items.map((t) => <TaskCard key={t.id} t={t} back={lnk({})} canEdit={open} projects={projects ?? []} clients={clients ?? []} members={mem} attachments={na.get(t.id)} projectName={t.project_id ? pn.get(t.project_id) : undefined} clientName={t.client_id ? cn.get(t.client_id) : undefined} assigneeName={t.assignee_id ? mn.get(t.assignee_id) : undefined} />)}
                  {!items.length && <p className="px-1.5 py-6 text-center text-xs text-muted">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <Section title="Dica"><p className="text-sm text-muted">Clique no título da tarefa para abrir os detalhes e <b>anexar arquivos ou links do Google Drive</b>. Tarefas atrasadas geram alertas automáticos; os prazos também aparecem na <Link href="/agenda" className="underline">Agenda</Link>.</p></Section>
    </>
  );
}
