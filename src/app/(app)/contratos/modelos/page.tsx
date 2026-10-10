import { requireWorkspace } from '@/lib/session';
import { PageHeader, Field, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { BUILTIN_TEMPLATES, CONTRACT_VARS } from '@/lib/contracts';
import { deleteTemplate, saveTemplate } from '../actions';

export const metadata = { title: 'Modelos de contrato' };

export default async function Modelos({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('contratos');
  const { from } = await searchParams;
  const { data } = await supabase.from('contract_templates').select('id, name, body').eq('workspace_id', ws.id).order('name');
  const base = BUILTIN_TEMPLATES.find((t) => t.id === from);
  return (
    <>
      <PageHeader title="Modelos de contrato" subtitle="Crie modelos próprios com variáveis que o sistema preenche automaticamente." />
      <Section title="Variáveis disponíveis"><p className="flex flex-wrap gap-2 text-xs">{CONTRACT_VARS.map((v) => <code key={v.key} title={v.label} className="rounded-md bg-subtle px-2 py-1">{`{{${v.key}}}`}</code>)}</p></Section>
      {open && (
        <form action={saveTemplate} className="card mt-6 space-y-4">
          <h2 className="font-semibold">Novo modelo</h2>
          <p className="text-xs text-muted">Comece de um modelo do sistema: {BUILTIN_TEMPLATES.map((t) => <a key={t.id} href={`/contratos/modelos?from=${encodeURIComponent(t.id)}`} className="mr-2 underline">{t.name}</a>)}</p>
          <Field label="Nome"><input name="name" required defaultValue={base?.name} className="input" /></Field>
          <Field label="Texto"><textarea name="body" required rows={16} defaultValue={base?.body} className="input font-mono !text-[13px]" /></Field>
          <SubmitButton>Salvar modelo</SubmitButton>
        </form>
      )}
      <div className="mt-6 space-y-4">
        {data?.map((t) => (
          <details key={t.id} className="card !p-4">
            <summary className="cursor-pointer font-medium">{t.name}</summary>
            <form action={saveTemplate} className="mt-4 space-y-3">
              <input type="hidden" name="id" value={t.id} />
              <Field label="Nome"><input name="name" defaultValue={t.name} className="input" /></Field>
              <Field label="Texto"><textarea name="body" rows={14} defaultValue={t.body} className="input font-mono !text-[13px]" /></Field>
              <div className="flex gap-3"><SubmitButton pendingText="…">Salvar</SubmitButton></div>
            </form>
            <form action={deleteTemplate.bind(null, t.id)} className="mt-2"><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Excluir este modelo?">Excluir</SubmitButton></form>
          </details>
        ))}
      </div>
    </>
  );
}
