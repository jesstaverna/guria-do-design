import Link from 'next/link';
import { notFound } from 'next/navigation';
import { APP_URL } from '@/lib/brand';
import { suggestTemplate } from '@/lib/onboarding';
import { requireWorkspace } from '@/lib/session';
import { Badge, Field, PageHeader, Section } from '@/components/ui';
import { CopyButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { PROPOSAL_STATUS, todayBR, addDays } from '@/lib/domain';
import { centsToInput, dateTimeBR, money } from '@/lib/format';
import { activateProposal, addItem, changeStatus, deleteItem, deleteProposal, duplicateProposal, saveProposal, sendProposal, updateItem } from '../actions';

export const metadata = { title: 'Proposta' };

const EVENT: Record<string, string> = { enviada: 'Enviada', visualizada: 'Cliente visualizou', aceita: 'Aceita pelo cliente', alteracao_solicitada: 'Cliente pediu alterações', ativada: 'Financeiro ativado' };

export default async function ProposalEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, isAdmin, open } = await requireWorkspace('propostas');
  const { data: p } = await supabase.from('proposals').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const [{ data: items }, { data: events }, { data: leads }, { data: clients }, { data: contract }, { data: templates }] = await Promise.all([
    supabase.from('proposal_items').select('*').eq('proposal_id', id).order('position').order('id'),
    supabase.from('proposal_events').select('id, kind, detail, ip, created_at').eq('proposal_id', id).order('created_at', { ascending: false }),
    supabase.from('leads').select('id, name').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(300),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('contracts').select('id').eq('proposal_id', id).limit(1),
    supabase.from('onboarding_templates').select('id, name, keywords').eq('workspace_id', ws.id).eq('active', true).order('position'),
  ]);
  const suggested = suggestTemplate(`${p.title} ${(items ?? []).map((i) => i.name).join(' ')}`, templates ?? []);
  const locked = p.status === 'aceita' || !open;
  const link = `${APP_URL}/p/${p.token}`;
  const st = PROPOSAL_STATUS[p.status];
  const isOpen = ['enviada', 'visualizada', 'em_negociacao'].includes(p.status);

  return (
    <>
      <PageHeader title={`#${p.number} · ${p.title}`} subtitle={`Criada em ${dateTimeBR(p.created_at)}`} actions={<>
        <Badge tone={st?.tone}>{st?.label}</Badge>
        <Link href={`/propostas/${id}/preview`} className="btn btn-sm">Pré-visualizar / PDF</Link>
        {p.status !== 'rascunho' && <CopyButton text={link} label="Copiar link do cliente" />}
        {open && <form action={duplicateProposal.bind(null, id)}><SubmitButton className="btn btn-sm" pendingText="…">Duplicar</SubmitButton></form>}
        {open && p.status === 'rascunho' && <form action={sendProposal.bind(null, id)}><SubmitButton className="btn btn-primary btn-sm" pendingText="Enviando…" confirm="Liberar o link desta proposta para o cliente?">Liberar link / enviar</SubmitButton></form>}
      </>} />

      <div className="grid gap-6 xl:grid-cols-3">
        <form action={saveProposal.bind(null, id)} className="space-y-4 xl:col-span-2">
          <fieldset disabled={locked} className="card grid gap-4 sm:grid-cols-2">
            <Field label="Título *" className="sm:col-span-2"><input name="title" required defaultValue={p.title} className="input" /></Field>
            <Field label="Lead"><select name="lead_id" defaultValue={p.lead_id ?? ''} className="input"><option value="">—</option>{leads?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Cliente"><select name="client_id" defaultValue={p.client_id ?? ''} className="input"><option value="">—</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            {([['intro', 'Apresentação'], ['diagnosis', 'Diagnóstico (o problema que você resolve)'], ['scope', 'Escopo e entregas'], ['exclusions', 'O que não está incluso'], ['timeline', 'Cronograma'], ['payment_terms', 'Condições de pagamento'], ['closing', 'Fechamento e próximos passos']] as const).map(([k, label]) => (
              <Field key={k} label={label} className="sm:col-span-2"><textarea name={k} rows={k === 'scope' ? 7 : 4} defaultValue={p[k] ?? ''} className="input" /></Field>
            ))}
            <Field label="Válida até"><input name="valid_until" type="date" defaultValue={p.valid_until ?? ''} min={todayBR()} className="input" /></Field>
            <Field label="Vigência dos itens mensais (meses)"><input name="contract_months" type="number" min={1} max={60} defaultValue={p.contract_months} className="input" /></Field>
            <Field label="Desconto (R$)"><input name="discount" inputMode="decimal" defaultValue={p.discount_cents ? centsToInput(p.discount_cents) : ''} className="input" placeholder="0,00" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Salvar proposta</SubmitButton></div>
          </fieldset>
          {p.status === 'aceita' && <p className="text-sm text-muted">Proposta aceita: itens e valores ficam bloqueados para preservar o que o cliente aprovou.</p>}
        </form>

        <div className="space-y-6">
          <Section title="Investimento">
            <ul className="space-y-3">
              {items?.map((i) => (
                <li key={i.id} className="rounded-xl border border-line p-3">
                  <form action={updateItem.bind(null, id, i.id)} className="space-y-2">
                    <fieldset disabled={locked} className="space-y-2">
                      <input name="name" defaultValue={i.name} required className="input !py-1.5" aria-label="Nome do item" />
                      <input name="description" defaultValue={i.description ?? ''} placeholder="Descrição (opcional)" className="input !py-1.5 text-xs" aria-label="Descrição" />
                      <div className="grid grid-cols-3 gap-2">
                        <input name="quantity" defaultValue={Number(i.quantity)} inputMode="decimal" className="input !py-1.5" aria-label="Quantidade" />
                        <input name="price" defaultValue={centsToInput(i.unit_price_cents)} inputMode="decimal" className="input !py-1.5" aria-label="Valor unitário" />
                        <select name="billing" defaultValue={i.billing} className="input !py-1.5" aria-label="Cobrança"><option value="pontual">Pontual</option><option value="mensal">Mensal</option></select>
                      </div>
                      <div className="flex gap-2"><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></div>
                    </fieldset>
                  </form>
                  {!locked && <form action={deleteItem.bind(null, id, i.id)} className="mt-2"><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover este item?">Remover</SubmitButton></form>}
                </li>
              ))}
              {!items?.length && <p className="text-sm text-muted">Sem itens. Adicione abaixo.</p>}
            </ul>
            {!locked && (
              <form action={addItem.bind(null, id)} className="mt-4 space-y-2 border-t border-line pt-4">
                <div className="label">Adicionar item</div>
                <input name="name" required placeholder="Ex.: Logotipo + manual" className="input !py-1.5" />
                <div className="grid grid-cols-3 gap-2">
                  <input name="quantity" defaultValue="1" inputMode="decimal" className="input !py-1.5" aria-label="Quantidade" />
                  <input name="price" placeholder="0,00" inputMode="decimal" className="input !py-1.5" aria-label="Valor unitário" />
                  <select name="billing" className="input !py-1.5" aria-label="Cobrança"><option value="pontual">Pontual</option><option value="mensal">Mensal</option></select>
                </div>
                <SubmitButton className="btn btn-sm" pendingText="…">Adicionar</SubmitButton>
              </form>
            )}
            <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Pontual</dt><dd>{money(p.one_time_cents)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Mensal × {p.contract_months}</dt><dd>{money(p.monthly_cents)}</dd></div>
              {p.discount_cents > 0 && <div className="flex justify-between"><dt className="text-muted">Desconto</dt><dd>− {money(p.discount_cents)}</dd></div>}
              <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{money(p.total_cents)}</dd></div>
            </dl>
          </Section>

          {isOpen && open && (
            <Section title="Andamento">
              <div className="flex flex-wrap gap-2">
                <form action={changeStatus.bind(null, id, 'recusada')}><SubmitButton className="btn btn-sm" pendingText="…" confirm="Marcar como recusada?">Marcar recusada</SubmitButton></form>
              </div>
              <p className="mt-2 text-xs text-muted">Link: <span className="break-all">{link}</span></p>
            </Section>
          )}
          {open && ['expirada', 'recusada', 'em_negociacao'].includes(p.status) && (
            <Section title="Reabrir"><form action={changeStatus.bind(null, id, 'enviada')}><SubmitButton className="btn btn-sm" pendingText="…">Reabrir por 15 dias (até {addDays(todayBR(), 15).split('-').reverse().join('/')})</SubmitButton></form></Section>
          )}

          {p.status === 'aceita' && (
            <Section title="Próximos passos">
              <p className="mb-3 text-sm text-muted">Aceita por {p.accepted_by_name} em {dateTimeBR(p.accepted_at)}.</p>
              <div className="space-y-3">
                {contract?.length ? <Link href={`/contratos/${contract[0].id}`} className="btn w-full">Ver contrato</Link> : open && <Link href={`/contratos/novo?proposal=${id}`} className="btn btn-primary w-full">Gerar contrato</Link>}
                {isAdmin && !p.activated_at && open && (
                  <form action={activateProposal.bind(null, id)} className="space-y-2 rounded-xl border border-line p-3">
                    <div className="text-sm font-medium">Ativar financeiro</div>
                    <p className="text-xs text-muted">Gera as parcelas do valor pontual, as mensalidades e (opcional) um projeto com onboarding.</p>
                    <div className="grid grid-cols-2 gap-2"><Field label="Parcelas"><input name="installments" type="number" min={1} max={36} defaultValue={2} className="input !py-1.5" /></Field><Field label="1º vencimento"><input name="first_due" type="date" defaultValue={todayBR()} required className="input !py-1.5" /></Field></div>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="create_project" defaultChecked />Criar projeto</label>
                    {!!templates?.length && <Field label="Onboarding do cliente" hint="Cria as etapas com datas e o Espaço do Cliente. Você pode ajustar depois."><select name="template_id" defaultValue={suggested ?? ''} className="input !py-1.5"><option value="">Sem onboarding</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
                    <SubmitButton className="btn btn-primary btn-sm" pendingText="Ativando…">Ativar</SubmitButton>
                  </form>
                )}
                {p.activated_at && <p className="text-sm text-ok">Financeiro ativado em {dateTimeBR(p.activated_at)}.</p>}
              </div>
            </Section>
          )}

          <Section title="Histórico">
            {!events?.length ? <p className="text-sm text-muted">Sem eventos ainda.</p> : <ul className="space-y-2.5 text-sm">{events.map((e) => (
              <li key={e.id}><div className="font-medium">{EVENT[e.kind] ?? e.kind}</div><div className="text-xs text-muted">{dateTimeBR(e.created_at)}{e.ip ? ` · IP ${e.ip}` : ''}</div>{e.detail && <div className="mt-0.5 text-xs">{e.detail}</div>}</li>))}</ul>}
          </Section>
          {p.status === 'rascunho' && open && <form action={deleteProposal.bind(null, id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Excluir este rascunho?">Excluir rascunho</SubmitButton></form>}
        </div>
      </div>
    </>
  );
}
