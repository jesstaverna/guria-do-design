import Link from 'next/link';
import { requireWorkspace, flash } from '@/lib/session';
import { Field, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { addStep, createTemplate, deleteStep, deleteTemplate, saveStep, saveTemplate } from './actions';

export const metadata = { title: 'Modelos de onboarding' };

export default async function Modelos() {
  const { supabase, ws, isAdmin, open } = await requireWorkspace('projetos');
  if (!isAdmin) flash('/projetos', 'err', 'Só administradores editam os modelos de onboarding.');
  const [{ data: templates }, { data: steps }] = await Promise.all([
    supabase.from('onboarding_templates').select('*').eq('workspace_id', ws.id).order('position').order('name'),
    supabase.from('onboarding_steps').select('*').eq('workspace_id', ws.id).order('position').order('title'),
  ]);
  return (
    <>
      <PageHeader title="Modelos de onboarding" subtitle="As etapas que viram tarefas (com datas) quando você ativa uma proposta ou inicia o onboarding de um projeto." actions={<Link href="/projetos" className="btn btn-sm">← Projetos</Link>} />
      {open && (
        <details className="card mb-6 !p-4"><summary className="cursor-pointer text-sm font-medium">+ Novo modelo</summary>
          <form action={createTemplate} className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Nome *"><input name="name" required minLength={2} className="input" placeholder="ex.: Branding completo" /></Field>
            <Field label="Palavras-chave" hint="Sugerem o modelo ao ativar uma proposta."><input name="keywords" className="input" placeholder="logo, marca, identidade" /></Field>
            <Field label="Descrição"><input name="description" className="input" /></Field>
            <div className="sm:col-span-3"><SubmitButton pendingText="…">Criar modelo</SubmitButton></div>
          </form></details>
      )}
      <div className="space-y-6">
        {(templates ?? []).map((t) => {
          const list = (steps ?? []).filter((s) => s.template_id === t.id);
          const total = list.reduce((a, s) => a + s.duration_days, 0);
          return (
            <section key={t.id} className="card space-y-4">
              <form action={saveTemplate.bind(null, t.id)} className="grid gap-3 sm:grid-cols-4">
                <fieldset disabled={!open} className="contents">
                  <Field label="Nome"><input name="name" defaultValue={t.name} required className="input" /></Field>
                  <Field label="Palavras-chave"><input name="keywords" defaultValue={t.keywords ?? ''} className="input" /></Field>
                  <Field label="Descrição"><input name="description" defaultValue={t.description ?? ''} className="input" /></Field>
                  <div className="flex items-end gap-3"><label className="flex items-center gap-2 pb-2.5 text-sm"><input type="checkbox" name="active" defaultChecked={t.active} />Ativo</label><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></div>
                </fieldset>
              </form>
              <div className="text-xs text-muted">{list.length} etapa(s) · prazo total de {total} dia(s) a partir do início</div>
              <details className="group"><summary className="cursor-pointer text-sm font-medium">Ver e editar as {list.length} etapas</summary>
              <div className="mt-3 space-y-2">
                {list.map((s) => (
                  <form key={s.id} action={saveStep.bind(null, s.id)} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-12">
                    <fieldset disabled={!open} className="contents">
                      <Field label="Ordem" className="sm:col-span-1"><input name="position" type="number" min={1} max={99} defaultValue={s.position} className="input !py-1.5" /></Field>
                      <Field label="Etapa" className="sm:col-span-4"><input name="title" defaultValue={s.title} required className="input !py-1.5" /></Field>
                      <Field label="Instrução (aparece para o cliente)" className="sm:col-span-3"><input name="description" defaultValue={s.description ?? ''} className="input !py-1.5" /></Field>
                      <Field label="Dias" className="sm:col-span-1"><input name="duration_days" type="number" min={0} max={180} defaultValue={s.duration_days} className="input !py-1.5" /></Field>
                      <Field label="Quem faz" className="sm:col-span-2"><select name="owner_side" defaultValue={s.owner_side} className="input !py-1.5"><option value="estudio">Estúdio</option><option value="cliente">Cliente</option></select></Field>
                      <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="client_visible" defaultChecked={s.client_visible} />Visível ao cliente</label>
                      <div className="flex gap-2 sm:col-span-10 sm:justify-end"><SubmitButton className="btn btn-sm" pendingText="…">Salvar etapa</SubmitButton><button type="submit" formAction={deleteStep.bind(null, s.id)} formNoValidate className="btn btn-sm !text-danger">Remover</button></div>
                    </fieldset>
                  </form>
                ))}
              </div></details>
              {open && (
                <details className="rounded-xl border border-dashed border-line p-3"><summary className="cursor-pointer text-sm font-medium">+ Nova etapa</summary>
                  <form action={addStep.bind(null, t.id)} className="mt-3 grid items-end gap-2 sm:grid-cols-12">
                    <Field label="Ordem" className="sm:col-span-1"><input name="position" type="number" min={1} max={99} defaultValue={list.length + 1} className="input !py-1.5" /></Field>
                    <Field label="Etapa *" className="sm:col-span-4"><input name="title" required className="input !py-1.5" /></Field>
                    <Field label="Instrução" className="sm:col-span-3"><input name="description" className="input !py-1.5" /></Field>
                    <Field label="Dias" className="sm:col-span-1"><input name="duration_days" type="number" min={0} max={180} defaultValue={3} className="input !py-1.5" /></Field>
                    <Field label="Quem faz" className="sm:col-span-2"><select name="owner_side" className="input !py-1.5"><option value="estudio">Estúdio</option><option value="cliente">Cliente</option></select></Field>
                    <label className="flex items-center gap-2 text-xs sm:col-span-2"><input type="checkbox" name="client_visible" defaultChecked />Visível ao cliente</label>
                    <div className="sm:col-span-10"><SubmitButton className="btn btn-sm" pendingText="…">Adicionar etapa</SubmitButton></div>
                  </form></details>
              )}
              {open && <form action={deleteTemplate.bind(null, t.id)} className="border-t border-line pt-3 text-right"><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm={`Excluir o modelo “${t.name}” e todas as etapas?`}>Excluir modelo</SubmitButton></form>}
            </section>
          );
        })}
      </div>
    </>
  );
}
