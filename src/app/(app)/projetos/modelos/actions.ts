'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { int, opt, pick, str } from '@/lib/forms';

const B = '/projetos/modelos';
async function adminCtx() {
  const ctx = await requireWritable('projetos');
  if (!ctx.isAdmin) flash(B, 'err', 'Só administradores editam os modelos de onboarding.');
  return ctx;
}

export async function createTemplate(fd: FormData) {
  const { supabase, ws } = await adminCtx();
  const name = str(fd, 'name');
  if (name.length < 2) flash(B, 'err', 'Dê um nome ao modelo.');
  const { error } = await supabase.from('onboarding_templates').insert({ workspace_id: ws.id, name, keywords: opt(fd, 'keywords'), description: opt(fd, 'description'), position: 99 });
  if (error) flash(B, 'err', dbMessage(error));
  revalidatePath(B); flash(B, 'ok', 'Modelo criado. Adicione as etapas.');
}

export async function saveTemplate(id: string, fd: FormData) {
  const { supabase, ws } = await adminCtx();
  const name = str(fd, 'name');
  if (name.length < 2) flash(B, 'err', 'Dê um nome ao modelo.');
  const { error } = await supabase.from('onboarding_templates').update({ name, keywords: opt(fd, 'keywords'), description: opt(fd, 'description'), active: fd.get('active') === 'on' }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(B, 'err', dbMessage(error));
  revalidatePath(B); flash(B, 'ok', 'Modelo salvo.');
}

export async function deleteTemplate(id: string) {
  const { supabase, ws } = await adminCtx();
  const { error } = await supabase.from('onboarding_templates').delete().eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(B, 'err', dbMessage(error));
  revalidatePath(B); flash(B, 'ok', 'Modelo excluído. Projetos que já usaram o modelo não mudam.');
}

function stepFields(fd: FormData) {
  return { title: str(fd, 'title'), description: opt(fd, 'description'), duration_days: Math.min(Math.max(int(fd, 'duration_days', 3), 0), 180), owner_side: pick(fd, 'owner_side', ['estudio', 'cliente'] as const, 'estudio'), client_visible: fd.get('client_visible') === 'on', position: Math.min(Math.max(int(fd, 'position', 1), 1), 99) };
}

export async function addStep(templateId: string, fd: FormData) {
  const { supabase, ws } = await adminCtx();
  const v = stepFields(fd);
  if (v.title.length < 2) flash(B, 'err', 'Descreva a etapa.');
  const { error } = await supabase.from('onboarding_steps').insert({ ...v, workspace_id: ws.id, template_id: templateId });
  if (error) flash(B, 'err', dbMessage(error));
  revalidatePath(B); flash(B, 'ok', 'Etapa adicionada.');
}

export async function saveStep(id: string, fd: FormData) {
  const { supabase, ws } = await adminCtx();
  const v = stepFields(fd);
  if (v.title.length < 2) flash(B, 'err', 'Descreva a etapa.');
  const { error } = await supabase.from('onboarding_steps').update(v).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(B, 'err', dbMessage(error));
  revalidatePath(B); flash(B, 'ok', 'Etapa salva.');
}

export async function deleteStep(id: string) {
  const { supabase, ws } = await adminCtx();
  const { error } = await supabase.from('onboarding_steps').delete().eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(B, 'err', dbMessage(error));
  revalidatePath(B); flash(B, 'ok', 'Etapa removida.');
}
