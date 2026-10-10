'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { cents, date, opt, str, uuid } from '@/lib/forms';
import { BUILTIN_TEMPLATES, renderTemplate } from '@/lib/contracts';
import { money } from '@/lib/format';

const BASE = '/contratos';

export async function createContract(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('contratos');
  const clientId = uuid(fd, 'client_id'), proposalId = uuid(fd, 'proposal_id');
  const tplId = str(fd, 'template');
  let body = BUILTIN_TEMPLATES.find((t) => t.id === tplId)?.body;
  if (!body) {
    const { data } = await supabase.from('contract_templates').select('body').eq('id', tplId).eq('workspace_id', ws.id).maybeSingle();
    body = data?.body;
  }
  if (!body) flash(`${BASE}/novo`, 'err', 'Escolha um modelo de contrato.');
  const { data: client } = clientId ? await supabase.from('clients').select('name, company, document, address, email, city').eq('id', clientId).eq('workspace_id', ws.id).maybeSingle() : { data: null };
  const value = cents(fd, 'value') ?? 0;
  const start = date(fd, 'start_date'), end = date(fd, 'end_date');
  const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '');
  const text = renderTemplate(body!, {
    contratada_nome: ws.legal_name || ws.name, contratada_documento: ws.document, contratada_endereco: [ws.address, ws.city].filter(Boolean).join(' — '), contratada_email: ws.email,
    contratante_nome: client?.name, contratante_documento: client?.document, contratante_endereco: [client?.address, client?.city].filter(Boolean).join(' — '), contratante_email: client?.email,
    objeto: opt(fd, 'objeto'), valor_total: value ? money(value) : null, forma_pagamento: opt(fd, 'forma_pagamento'), prazo: opt(fd, 'prazo'),
    data_inicio: fmt(start), data_fim: fmt(end), cidade: opt(fd, 'cidade') ?? ws.city,
    data_hoje: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: 'numeric', month: 'long', year: 'numeric' }),
  });
  const title = str(fd, 'title') || `Contrato — ${client?.name ?? 'cliente'}`;
  const { data, error } = await supabase.from('contracts').insert({
    workspace_id: ws.id, title, client_id: clientId, proposal_id: proposalId, body: text, start_date: start, end_date: end, value_cents: value, created_by: user.id,
  }).select('id').single();
  if (error) flash(`${BASE}/novo`, 'err', dbMessage(error));
  revalidatePath(BASE);
  flash(`${BASE}/${data!.id}`, 'ok', 'Contrato gerado. Revise o texto e preencha os campos [________] antes de enviar.');
}

export async function saveContract(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('contratos');
  const { error } = await supabase.from('contracts').update({ title: str(fd, 'title'), body: str(fd, 'body'), start_date: date(fd, 'start_date'), end_date: date(fd, 'end_date') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${id}`);
  flash(`${BASE}/${id}`, 'ok', 'Contrato salvo.');
}

export async function sendContract(id: string) {
  const { supabase, ws } = await requireWritable('contratos');
  const { data: c } = await supabase.from('contracts').select('body, status').eq('id', id).eq('workspace_id', ws.id).single();
  if (!c || c.status !== 'rascunho') flash(`${BASE}/${id}`, 'err', 'Somente rascunhos podem ser enviados.');
  if (c!.body.includes('[________]')) flash(`${BASE}/${id}`, 'err', 'Ainda há campos [________] para preencher no texto.');
  const { error } = await supabase.from('contracts').update({ status: 'enviado' }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(BASE);
  flash(`${BASE}/${id}`, 'ok', 'Contrato liberado para assinatura. Copie o link e envie ao cliente.');
}

export async function cancelContract(id: string) {
  const { supabase, ws } = await requireWritable('contratos');
  const { error } = await supabase.from('contracts').update({ status: 'cancelado' }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  revalidatePath(BASE);
  flash(`${BASE}/${id}`, 'ok', 'Contrato cancelado.');
}

export async function saveTemplate(fd: FormData) {
  const { supabase, ws } = await requireWritable('contratos');
  const id = uuid(fd, 'id'), name = str(fd, 'name'), body = str(fd, 'body');
  if (name.length < 2 || body.length < 20) flash(`${BASE}/modelos`, 'err', 'Informe nome e texto do modelo.');
  const { error } = id ? await supabase.from('contract_templates').update({ name, body }).eq('id', id).eq('workspace_id', ws.id) : await supabase.from('contract_templates').insert({ workspace_id: ws.id, name, body });
  if (error) flash(`${BASE}/modelos`, 'err', dbMessage(error));
  revalidatePath(`${BASE}/modelos`);
  flash(`${BASE}/modelos`, 'ok', 'Modelo salvo.');
}

export async function deleteTemplate(id: string) {
  const { supabase, ws } = await requireWritable('contratos');
  await supabase.from('contract_templates').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath(`${BASE}/modelos`);
  flash(`${BASE}/modelos`, 'ok', 'Modelo excluído.');
}
