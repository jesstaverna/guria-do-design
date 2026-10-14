'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWorkspace, requireWritable } from '@/lib/session';
import { cents, date, opt, pick, str, uuid } from '@/lib/forms';

function fields(fd: FormData) {
  const nextAt = opt(fd, 'next_action_at');
  return {
    name: str(fd, 'name'), company: opt(fd, 'company'), email: opt(fd, 'email')?.toLowerCase() ?? null, phone: opt(fd, 'phone'),
    source: opt(fd, 'source'), service_interest: opt(fd, 'service_interest'), potential_value_cents: cents(fd, 'potential_value') ?? 0,
    stage_id: uuid(fd, 'stage_id'), owner_id: uuid(fd, 'owner_id'), notes: opt(fd, 'notes'), next_action: opt(fd, 'next_action'),
    next_action_at: nextAt && !Number.isNaN(Date.parse(nextAt)) ? new Date(nextAt).toISOString() : null,
    lost_reason: opt(fd, 'lost_reason'),
  };
}

export async function createLead(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('crm');
  const v = fields(fd);
  if (v.name.length < 2) flash('/crm/novo', 'err', 'Informe o nome do lead.');
  if (!v.stage_id) flash('/crm/novo', 'err', 'Escolha a etapa.');
  if (!v.email && !v.phone) flash('/crm/novo', 'err', 'Informe ao menos e-mail ou telefone.');
  const { data, error } = await supabase.from('leads').insert({ ...v, workspace_id: ws.id, created_by: user.id }).select('id').single();
  if (error) {
    if (error.code === '23505') flash('/crm/novo', 'err', 'Já existe um lead com este e-mail ou telefone.');
    flash('/crm/novo', 'err', dbMessage(error, 'Não foi possível salvar o lead.'));
  }
  revalidatePath('/crm');
  flash(`/crm/${data!.id}`, 'ok', 'Lead criado.');
}

export async function updateLead(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('crm');
  const v = fields(fd);
  if (!v.stage_id) flash(`/crm/${id}`, 'err', 'Escolha a etapa.');
  const { error } = await supabase.from('leads').update(v).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/crm/${id}`, 'err', error.code === '23505' ? 'Outro lead já usa este e-mail ou telefone.' : dbMessage(error));
  revalidatePath('/crm');
  flash(`/crm/${id}`, 'ok', 'Lead atualizado.');
}

/** Kanban (arrastar) e seletor de etapa. Retorna mensagem de erro ou null. */
export async function moveLead(id: string, stageId: string, lostReason?: string): Promise<string | null> {
  const { supabase, ws, open } = await requireWorkspace('crm');
  if (!open) return 'Assinatura inativa: o sistema está em modo somente leitura.';
  const patch: Record<string, unknown> = { stage_id: stageId };
  if (lostReason) patch.lost_reason = lostReason.trim();
  const { error } = await supabase.from('leads').update(patch).eq('id', id).eq('workspace_id', ws.id);
  if (error) return error.code === '23514' ? 'Informe o motivo da perda.' : 'Não foi possível mover o lead.';
  revalidatePath('/crm');
  return null;
}

/** Grava a ordem dos cartões de uma etapa do funil (arrastar e soltar). */
export async function reorderLeads(ids: string[]): Promise<string | null> {
  const { supabase, open } = await requireWorkspace('crm');
  if (!open) return 'Assinatura inativa: o sistema está em modo somente leitura.';
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((i) => /^[0-9a-f-]{36}$/i.test(i))) return 'Ordem inválida.';
  const { error } = await supabase.rpc('kanban_renumber', { p_kind: 'leads', p_ids: ids });
  return error ? 'Não foi possível salvar a ordem.' : null;
}

export async function addInteraction(leadId: string, fd: FormData) {
  const { supabase, ws, user } = await requireWritable('crm');
  const content = str(fd, 'content');
  if (!content) flash(`/crm/${leadId}`, 'err', 'Escreva o conteúdo do registro.');
  const kind = pick(fd, 'kind', ['nota', 'ligacao', 'whatsapp', 'email', 'reuniao'] as const, 'nota');
  const { error } = await supabase.from('lead_interactions').insert({ workspace_id: ws.id, lead_id: leadId, kind, content, created_by: user.id });
  if (error) flash(`/crm/${leadId}`, 'err', dbMessage(error, 'Não foi possível registrar.'));
  revalidatePath(`/crm/${leadId}`);
  flash(`/crm/${leadId}`, 'ok', 'Registro adicionado ao histórico.');
}

export async function convertLead(leadId: string) {
  const { supabase } = await requireWritable('crm');
  const { data, error } = await supabase.rpc('convert_lead', { p_lead: leadId });
  if (error) flash(`/crm/${leadId}`, 'err', dbMessage(error, 'Não foi possível converter.'));
  revalidatePath('/crm');
  flash(`/clientes/${data}`, 'ok', 'Lead convertido em cliente.');
}

export async function addLeadTask(leadId: string, fd: FormData) {
  const { supabase, ws, user } = await requireWritable('crm');
  const title = str(fd, 'title');
  if (title.length < 2) flash(`/crm/${leadId}`, 'err', 'Descreva o próximo passo.');
  const { error } = await supabase.from('tasks').insert({ workspace_id: ws.id, title, due_date: date(fd, 'due_date'), lead_id: leadId, assignee_id: user.id, created_by: user.id, priority: 'media' });
  if (error) flash(`/crm/${leadId}`, 'err', dbMessage(error));
  revalidatePath(`/crm/${leadId}`);
  flash(`/crm/${leadId}`, 'ok', 'Tarefa de follow-up criada.');
}
