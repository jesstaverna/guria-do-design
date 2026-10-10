import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { requireWorkspace } from '@/lib/session';
import { PROPOSAL_PRESETS } from '@/lib/proposal-templates';
import { createProposal } from '../actions';

export const metadata = { title: 'Nova proposta' };

export default async function NovaProposta({ searchParams }: { searchParams: Promise<{ lead?: string; client?: string }> }) {
  const { supabase, ws } = await requireWorkspace('propostas');
  const sp = await searchParams;
  const [{ data: leads }, { data: clients }] = await Promise.all([
    supabase.from('leads').select('id, name, company').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(300),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
  ]);
  return (
    <>
      <PageHeader title="Nova proposta" subtitle="Escolha um modelo de estrutura; você edita tudo depois e define os valores." />
      <form action={createProposal} className="space-y-6">
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="label">Modelo</legend>
          {PROPOSAL_PRESETS.map((p, i) => (
            <label key={p.key} className="card flex cursor-pointer items-start gap-3 !p-4 has-[:checked]:border-accent">
              <input type="radio" name="preset" value={p.key} defaultChecked={i === 0} className="mt-1" />
              <span><span className="block font-medium">{p.label}</span><span className="block text-xs text-muted">{p.items.length ? p.items.map((x) => x.name).join(' · ') : 'Estrutura vazia'}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="card grid gap-4 sm:grid-cols-3">
          <Field label="Título (opcional)"><input name="title" className="input" placeholder="Usa o nome do modelo" /></Field>
          <Field label="Lead"><select name="lead_id" defaultValue={sp.lead ?? ''} className="input"><option value="">—</option>{leads?.map((l) => <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ''}</option>)}</select></Field>
          <Field label="ou Cliente existente"><select name="client_id" defaultValue={sp.client ?? ''} className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        </div>
        <SubmitButton pendingText="Criando…">Criar rascunho</SubmitButton>
      </form>
    </>
  );
}
