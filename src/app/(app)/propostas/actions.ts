'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { cents, date, int, opt, pick, str, uuid } from '@/lib/forms';
import { PROPOSAL_PRESETS } from '@/lib/proposal-templates';
import { addDays, todayBR } from '@/lib/domain';

const BASE = '/propostas';

export async function createProposal(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('propostas');
  const preset = PROPOSAL_PRESETS.find((p) => p.key === str(fd, 'preset')) ?? PROPOSAL_PRESETS[PROPOSAL_PRESETS.length - 1];
  const title = str(fd, 'title') || preset.title;
  const lead = uuid(fd, 'lead_id'), client = uuid(fd, 'client_id');
  const { data, error } = await supabase.from('proposals').insert({
    workspace_id: ws.id, title, lead_id: lead, client_id: client, created_by: user.id,
    intro: preset.intro, diagnosis: preset.diagnosis, scope: preset.scope, exclusions: preset.exclusions, timeline: preset.timeline,
    payment_terms: preset.payment_terms, closing: preset.closing, contract_months: preset.items.some((i) => i.billing === 'mensal') ? 6 : 1,
  }).select('id').single();
  if (error) flash(`${BASE}/nova`, 'err', dbMessage(error));
  if (preset.items.length) {
    await supabase.from('proposal_items').insert(preset.items.map((i, n) => ({ workspace_id: ws.id, proposal_id: data!.id, position: n, name: i.name, description: i.description, billing: i.billing, quantity: 1, unit_price_cents: 0 })));
  }
  revalidatePath(BASE);
  flash(`${BASE}/${data!.id}`, 'ok', 'Rascunho criado. Defina os valores dos itens e revise os textos.');
}

export async function saveProposal(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('propostas');
  const title = str(fd, 'title');
  if (title.length < 2) flash(`${BASE}/${id}`, 'err', 'Dê um título à proposta.');
  const { error } = await supabase.from('proposals').update({
    title, intro: opt(fd, 'intro'), diagnosis: opt(fd, 'diagnosis'), scope: opt(fd, 'scope'), exclusions: opt(fd, 'exclusions'), timeline: opt(fd, 'timeline'),
    payment_terms: opt(fd, 'payment_terms'), closing: opt(fd, 'closing'), valid_until: date(fd, 'valid_until'),
    contract_months: Math.min(Math.max(int(fd, 'contract_months', 1), 1), 60), discount_cents: cents(fd, 'discount') ?? 0,
    lead_id: uuid(fd, 'lead_id'), client_id: uuid(fd, 'client_id'),
  }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${id}`);
  flash(`${BASE}/${id}`, 'ok', 'Proposta salva.');
}

function itemFields(fd: FormData) {
  const quantity = Number(str(fd, 'quantity').replace(',', '.'));
  return {
    name: str(fd, 'name'), description: opt(fd, 'description'), billing: pick(fd, 'billing', ['pontual', 'mensal'] as const, 'pontual'),
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, unit_price_cents: cents(fd, 'price') ?? 0,
  };
}

export async function addItem(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('propostas');
  const v = itemFields(fd);
  if (!v.name) flash(`${BASE}/${id}`, 'err', 'Informe o nome do item.');
  const { count } = await supabase.from('proposal_items').select('id', { count: 'exact', head: true }).eq('proposal_id', id);
  const { error } = await supabase.from('proposal_items').insert({ ...v, workspace_id: ws.id, proposal_id: id, position: count ?? 0 });
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${id}`);
  flash(`${BASE}/${id}`, 'ok', 'Item adicionado.');
}

export async function updateItem(id: string, itemId: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('propostas');
  const v = itemFields(fd);
  if (!v.name) flash(`${BASE}/${id}`, 'err', 'Informe o nome do item.');
  const { error } = await supabase.from('proposal_items').update(v).eq('id', itemId).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${id}`);
  flash(`${BASE}/${id}`, 'ok', 'Item atualizado.');
}

export async function deleteItem(id: string, itemId: string) {
  const { supabase, ws } = await requireWritable('propostas');
  const { error } = await supabase.from('proposal_items').delete().eq('id', itemId).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${id}`);
  flash(`${BASE}/${id}`, 'ok', 'Item removido.');
}

export async function sendProposal(id: string) {
  const { supabase, ws } = await requireWritable('propostas');
  const { data: p } = await supabase.from('proposals').select('status, total_cents, valid_until').eq('id', id).eq('workspace_id', ws.id).single();
  if (!p || p.status !== 'rascunho') flash(`${BASE}/${id}`, 'err', 'Somente rascunhos podem ser enviados.');
  if (!p!.total_cents) flash(`${BASE}/${id}`, 'err', 'Defina os valores dos itens antes de enviar.');
  const { error } = await supabase.from('proposals').update({ status: 'enviada', valid_until: p!.valid_until ?? addDays(todayBR(), 15) }).eq('id', id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(BASE);
  flash(`${BASE}/${id}`, 'ok', 'Proposta liberada! Copie o link e envie ao cliente.');
}

export async function changeStatus(id: string, to: 'recusada' | 'enviada') {
  const { supabase, ws } = await requireWritable('propostas');
  const patch: Record<string, unknown> = { status: to };
  if (to === 'enviada') patch.valid_until = addDays(todayBR(), 15);
  const { error } = await supabase.from('proposals').update(patch).eq('id', id).eq('workspace_id', ws.id).in('status', to === 'recusada' ? ['enviada', 'visualizada', 'em_negociacao'] : ['expirada', 'recusada', 'em_negociacao']);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${id}`);
  flash(`${BASE}/${id}`, 'ok', to === 'recusada' ? 'Proposta marcada como recusada.' : 'Proposta reaberta por 15 dias.');
}

export async function duplicateProposal(id: string) {
  const { supabase, ws, user } = await requireWritable('propostas');
  const { data: p } = await supabase.from('proposals').select('*').eq('id', id).eq('workspace_id', ws.id).single();
  if (!p) flash(BASE, 'err', 'Proposta não encontrada.');
  const { data: copy, error } = await supabase.from('proposals').insert({
    workspace_id: ws.id, title: `${p!.title} (cópia)`, lead_id: p!.lead_id, client_id: p!.client_id, intro: p!.intro, diagnosis: p!.diagnosis, scope: p!.scope,
    exclusions: p!.exclusions, timeline: p!.timeline, payment_terms: p!.payment_terms, closing: p!.closing, contract_months: p!.contract_months,
    discount_cents: p!.discount_cents, created_by: user.id,
  }).select('id').single();
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  const { data: items } = await supabase.from('proposal_items').select('name, description, billing, quantity, unit_price_cents, position').eq('proposal_id', id);
  if (items?.length) await supabase.from('proposal_items').insert(items.map((i) => ({ ...i, workspace_id: ws.id, proposal_id: copy!.id })));
  flash(`${BASE}/${copy!.id}`, 'ok', 'Proposta duplicada como rascunho.');
}

export async function deleteProposal(id: string) {
  const { supabase, ws } = await requireWritable('propostas');
  const { error } = await supabase.from('proposals').delete().eq('id', id).eq('workspace_id', ws.id).eq('status', 'rascunho');
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(BASE);
  flash(BASE, 'ok', 'Rascunho excluído.');
}

export async function activateProposal(id: string, fd: FormData) {
  const { supabase } = await requireWritable('financeiro');
  const first = date(fd, 'first_due');
  if (!first) flash(`${BASE}/${id}`, 'err', 'Informe o primeiro vencimento.');
  const { error } = await supabase.rpc('activate_proposal', {
    p_id: id, p_installments: Math.min(Math.max(int(fd, 'installments', 1), 1), 36), p_first_due: first, p_create_project: fd.get('create_project') === 'on',
  });
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error, 'Não foi possível ativar o financeiro.'));
  revalidatePath('/financeiro');
  flash(`${BASE}/${id}`, 'ok', 'Financeiro e projeto criados a partir da proposta.');
}
