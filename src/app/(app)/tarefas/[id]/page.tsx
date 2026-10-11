import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Badge, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TaskFields } from '@/components/TaskParts';
import { AttachmentUploader } from '@/components/AttachmentUploader';
import { DriveLinkForm } from '@/components/DriveLinkForm';
import { PRIORITY, TASK_STATUS } from '@/lib/domain';
import { formatBytes } from '@/lib/attachments';
import { dateTimeBR } from '@/lib/format';
import { addLink, deleteTask, removeAttachment, updateTask } from '../actions';

export const metadata = { title: 'Tarefa' };

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, open } = await requireWorkspace('tarefas');
  const { data: t } = await supabase.from('tasks').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!t) notFound();
  const [{ data: projects }, { data: clients }, { data: members }, { data: atts }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('workspace_id', ws.id).order('name'),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
    supabase.from('task_attachments').select('id, kind, provider, name, url, mime, size_bytes, created_at').eq('task_id', id).order('created_at', { ascending: false }),
  ]);
  const mem = (members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }));
  const back = `/tarefas/${id}`;
  return (
    <>
      <PageHeader title={t.title} subtitle={TASK_STATUS.find((s) => s.key === t.status)?.label} actions={<><Badge tone={PRIORITY[t.priority]?.tone}>{PRIORITY[t.priority]?.label}</Badge><Link href="/tarefas" className="btn btn-sm">← Tarefas</Link></>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <form action={updateTask.bind(null, back, id)} className="card space-y-4 xl:col-span-2">
          <fieldset disabled={!open} className="space-y-4"><TaskFields t={t} projects={projects ?? []} clients={clients ?? []} members={mem} />{open && <SubmitButton>Salvar tarefa</SubmitButton>}</fieldset>
        </form>
        <div className="space-y-6">
          <Section title={`Anexos (${atts?.length ?? 0})`}>
            {!atts?.length ? <p className="text-sm text-muted">Nenhum anexo ainda.</p> : (
              <ul className="space-y-2.5 text-sm">{atts.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
                  <div className="min-w-0">
                    <a href={`/tarefas/anexo/${a.id}`} target={a.kind === 'link' ? '_blank' : undefined} rel="noopener noreferrer" className="break-words font-medium hover:underline">{a.kind === 'link' ? (a.provider === 'google_drive' ? '🟢 ' : '🔗 ') : '📄 '}{a.name}</a>
                    <div className="mt-0.5 text-xs text-muted">{a.kind === 'link' ? (a.provider === 'google_drive' ? 'Google Drive' : 'Link') : formatBytes(a.size_bytes)} · {dateTimeBR(a.created_at)}</div>
                  </div>
                  {open && <form action={removeAttachment.bind(null, id, a.id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover este anexo?">Remover</SubmitButton></form>}
                </li>))}</ul>
            )}
            {open && (
              <div className="mt-5 space-y-5 border-t border-line pt-5">
                <AttachmentUploader taskId={id} />
                <DriveLinkForm action={addLink.bind(null, id)} />
                <p className="text-xs text-muted">Links do Google Drive abrem para quem tem permissão no arquivo: compartilhe o arquivo com quem precisa.</p>
              </div>
            )}
          </Section>
          {open && <form action={deleteTask.bind(null, '/tarefas', id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Excluir esta tarefa e seus anexos?">Excluir tarefa</SubmitButton></form>}
        </div>
      </div>
    </>
  );
}
