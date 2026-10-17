'use server';
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { date, opt, pick, str, uuid } from '@/lib/forms';

const STATUS = ['planejado', 'em_andamento', 'pausado', 'concluido', 'cancelado'] as const;

function fields(fd: FormData) {
  return { name: str(fd, 'name'), client_id: uuid(fd, 'client_id'), status: pick(fd, 'status', STATUS, 'em_andamento'), start_date: date(fd, 'start_date'), due_date: date(fd, 'due_date'), description: opt(fd, 'description') };
}

export async function createProject(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('projetos');
  const v = fields(fd);
  if (v.name.length < 2) flash('/projetos', 'err', 'Dê um nome ao projeto.');
  const { data, error } = await supabase.from('projects').insert({ ...v, workspace_id: ws.id, created_by: user.id }).select('id').single();
  if (error) flash('/projetos', 'err', dbMessage(error));
  revalidatePath('/projetos');
  flash(`/projetos/${data!.id}`, 'ok', 'Projeto criado.');
}

export async function updateProject(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('projetos');
  const v = fields(fd);
  if (v.name.length < 2) flash(`/projetos/${id}`, 'err', 'Dê um nome ao projeto.');
  const { error } = await supabase.from('projects').update(v).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/projetos/${id}`, 'err', dbMessage(error));
  revalidatePath('/projetos');
  flash(`/projetos/${id}`, 'ok', 'Projeto atualizado.');
}

/** Cria as tarefas encadeadas do modelo escolhido (datas somando a duração de cada etapa a partir do início). */
export async function startProjectOnboarding(id: string, fd: FormData) {
  const { supabase } = await requireWritable('projetos');
  const tpl = uuid(fd, 'template_id'); const start = date(fd, 'start_date');
  if (!tpl) flash(`/projetos/${id}`, 'err', 'Escolha um modelo de onboarding.');
  const { data, error } = await supabase.rpc('start_onboarding', { p_project: id, p_template: tpl, p_start: start });
  if (error) flash(`/projetos/${id}`, 'err', dbMessage(error, 'Não foi possível iniciar o onboarding. Confira se a migração 0013 foi instalada.'));
  revalidatePath(`/projetos/${id}`); revalidatePath('/tarefas');
  flash(`/projetos/${id}`, 'ok', `Onboarding criado: ${data} etapa(s) com datas.`);
}

/** Espaço do Cliente: liga/desliga o link público e edita a mensagem de boas-vindas. */
export async function savePortal(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('projetos');
  const { error } = await supabase.from('projects').update({ portal_enabled: fd.get('portal_enabled') === 'on', welcome_message: opt(fd, 'welcome_message') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/projetos/${id}`, 'err', dbMessage(error));
  revalidatePath(`/projetos/${id}`);
  flash(`/projetos/${id}`, 'ok', 'Espaço do Cliente atualizado.');
}

/** Gera um link novo (o antigo deixa de funcionar). */
export async function regeneratePortalLink(id: string) {
  const { supabase, ws } = await requireWritable('projetos');
  const { error } = await supabase.from('projects').update({ portal_token: randomBytes(32).toString('hex') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/projetos/${id}`, 'err', dbMessage(error));
  revalidatePath(`/projetos/${id}`);
  flash(`/projetos/${id}`, 'ok', 'Novo link gerado. O link anterior não funciona mais.');
}
