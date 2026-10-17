import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Field, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { TaskCard, TaskFields } from '@/components/TaskParts';
import { createTask } from '../../tarefas/actions';
import { updateProject, startProjectOnboarding, savePortal, regeneratePortalLink } from '../actions';
import { CopyButton } from '@/components/ClientButtons';
import { APP_URL } from '@/lib/brand';
import { dateBR } from '@/lib/format';
import { TASK_STATUS } from '@/lib/domain';

export const metadata = { title: 'Projeto' };

export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, open, isAdmin } = await requireWorkspace('projetos');
  const { data: p } = await supabase.from('projects').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const [{ data: tasks }, { data: clients }, { data: members }, { data: templates }] = await Promise.all([
    supabase.from('tasks').select('id, title, description, status, priority, due_date, project_id, client_id, assignee_id, chain_pos, owner_side, client_visible, client_response, client_done_at').eq('project_id', id).order('due_date', { nullsFirst: false }),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
    supabase.from('onboarding_templates').select('id, name').eq('workspace_id', ws.id).eq('active', true).order('position'),
  ]);
  const chain = (tasks ?? []).filter((t) => t.chain_pos != null).sort((a, b) => (a.chain_pos ?? 0) - (b.chain_pos ?? 0));
  const portalLink = `${APP_URL}/cliente/${p.portal_token}`;
  const mem = (members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }));
  const back = `/projetos/${id}`;
  const thisProject = [{ id, name: p.name }];
  return (
    <>
      <PageHeader title={p.name} subtitle={`${tasks?.filter((t) => t.status === 'feito').length ?? 0}/${tasks?.length ?? 0} tarefas concluídas`} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Onboarding do cliente">
            {chain.length === 0 ? (
              open && !!templates?.length ? (
                <form action={startProjectOnboarding.bind(null, id)} className="space-y-3">
                  <p className="text-sm text-muted">Crie as etapas deste projeto a partir de um modelo, com datas encadeadas. O cliente acompanha tudo pelo Espaço do Cliente.</p>
                  <div className="grid gap-3 sm:grid-cols-3"><Field label="Modelo"><select name="template_id" required className="input"><option value="">Escolha…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
                    <Field label="Início"><input name="start_date" type="date" defaultValue={p.start_date ?? ''} className="input" /></Field>
                    <div className="flex items-end"><SubmitButton pendingText="Criando…">Iniciar onboarding</SubmitButton></div></div>
                </form>
              ) : <p className="text-sm text-muted">Este projeto ainda não tem onboarding.{isAdmin && <> Configure os <Link href="/projetos/modelos" className="underline">modelos de onboarding</Link>.</>}</p>
            ) : (
              <>
                <ol className="space-y-2">
                  {chain.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line p-3 text-sm">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${t.status === 'feito' ? 'bg-ok/20 text-ok' : 'bg-subtle text-muted'}`}>{t.status === 'feito' ? '✓' : t.chain_pos}</span>
                      <Link href={`/tarefas/${t.id}`} className={`font-medium hover:underline ${t.status === 'feito' ? 'text-muted line-through' : ''}`}>{t.title}</Link>
                      <span className={`badge ${t.owner_side === 'cliente' ? 'bg-warn/15 text-warn' : ''}`}>{t.owner_side === 'cliente' ? 'Cliente' : 'Estúdio'}</span>
                      <span className="ml-auto text-xs text-muted">{t.due_date ? dateBR(t.due_date) : 'sem data'}</span>
                      {t.client_response && <div className="w-full rounded-lg bg-subtle p-2 text-xs"><b>Resposta do cliente:</b> {t.client_response}</div>}
                    </li>))}
                </ol>
                <p className="mt-3 text-xs text-muted">Mudou o prazo de uma etapa? Edite a tarefa: as etapas seguintes ainda abertas se ajustam sozinhas.</p>
              </>
            )}
          </Section>
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
        <div className="space-y-6">
        <section className="card h-fit space-y-3">
          <h2 className="text-base font-semibold">Espaço do Cliente</h2>
          <p className="text-xs text-muted">Uma página com o seu logo onde o cliente acompanha as etapas e responde o que você pediu. Só quem tem o link acessa.</p>
          <div className="flex flex-wrap items-center gap-2"><CopyButton text={portalLink} label="Copiar link do cliente" /><a href={portalLink} target="_blank" rel="noreferrer noopener" className="btn btn-sm">Abrir</a></div>
          <form action={savePortal.bind(null, id)} className="space-y-3"><fieldset disabled={!open} className="space-y-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="portal_enabled" defaultChecked={p.portal_enabled} />Link ativo</label>
            <Field label="Mensagem de boas-vindas"><textarea name="welcome_message" rows={3} defaultValue={p.welcome_message ?? ''} className="input" placeholder="Oi! Aqui você acompanha cada etapa do seu projeto." /></Field>
            <SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></fieldset></form>
          {open && <form action={regeneratePortalLink.bind(null, id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Gerar um link novo? O link atual deixa de funcionar.">Gerar novo link</SubmitButton></form>}
        </section>
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
      </div>
    </>
  );
}
