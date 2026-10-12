import { PageHeader, Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { requireWorkspace } from '@/lib/session';
import { BUILTIN_TEMPLATES } from '@/lib/contracts';
import { centsToInput } from '@/lib/format';
import { createContract } from '../actions';

export const metadata = { title: 'Novo contrato' };

export default async function NovoContrato({ searchParams }: { searchParams: Promise<{ proposal?: string; client?: string }> }) {
  const { supabase, ws } = await requireWorkspace('contratos');
  const sp = await searchParams;
  const [{ data: clients }, { data: proposals }, { data: custom }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('proposals').select('id, number, title, status, client_id, scope, payment_terms, timeline, total_cents').eq('workspace_id', ws.id).in('status', ['aceita', 'enviada', 'visualizada', 'em_negociacao']).order('number', { ascending: false }).limit(200),
    supabase.from('contract_templates').select('id, name').eq('workspace_id', ws.id).order('name'),
  ]);
  const prop = proposals?.find((p) => p.id === sp.proposal);
  const clientId = sp.client ?? prop?.client_id ?? '';
  return (
    <>
      <PageHeader title="Novo contrato" subtitle="O texto é gerado com os dados do estúdio, do cliente e da proposta. Você revisa e edita antes de enviar." />
      <form action={createContract} className="card grid gap-4 sm:grid-cols-2">
        <Field label="Modelo *"><select name="template" required className="input">
          <optgroup label="Modelos OrbiaHUB">{BUILTIN_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
          {!!custom?.length && <optgroup label="Meus modelos">{custom.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>}
        </select></Field>
        <Field label="Título"><input name="title" className="input" placeholder="Ex.: Contrato — Identidade visual" /></Field>
        <Field label="Cliente *" hint="Documento e endereço vêm do cadastro do cliente."><select name="client_id" required defaultValue={clientId} className="input"><option value="">Selecione…</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Proposta de origem"><select name="proposal_id" defaultValue={sp.proposal ?? ''} className="input"><option value="">—</option>{proposals?.map((p) => <option key={p.id} value={p.id}>#{p.number} {p.title}</option>)}</select></Field>
        <Field label="Serviços contratados (objeto)" className="sm:col-span-2"><textarea name="objeto" rows={4} defaultValue={prop?.scope ?? ''} className="input" /></Field>
        <Field label="Valor total (R$)"><input name="value" inputMode="decimal" defaultValue={prop ? centsToInput(prop.total_cents) : ''} className="input" /></Field>
        <Field label="Forma de pagamento"><input name="forma_pagamento" defaultValue={prop?.payment_terms ?? ''} className="input" /></Field>
        <Field label="Prazo de entrega"><input name="prazo" defaultValue={prop?.timeline ?? ''} className="input" /></Field>
        <Field label="Cidade / foro"><input name="cidade" defaultValue={ws.city ?? ''} className="input" /></Field>
        <Field label="Início"><input name="start_date" type="date" className="input" /></Field>
        <Field label="Término / vigência"><input name="end_date" type="date" className="input" /></Field>
        <div className="sm:col-span-2"><SubmitButton pendingText="Gerando…">Gerar contrato</SubmitButton></div>
      </form>
    </>
  );
}
