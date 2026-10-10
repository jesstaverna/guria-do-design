'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { date, opt, pick, str, uuid } from '@/lib/forms';

const STATUS = ['a_fazer', 'fazendo', 'revisao', 'feito'] as const;
const PRIORITY = ['baixa', 'media', 'alta', 'urgente'] as const;

function fields(fd: FormData) {
  return {
    title: str(fd, 'title'), description: opt(fd, 'description'), priority: pick(fd, 'priority', PRIORITY, 'media'), due_date: date(fd, 'due_date'),
    project_id: uuid(fd, 'project_id'), client_id: uuid(fd, 'client_id'), assignee_id: uuid(fd, 'assignee_id'),
  };
}

export async function createTask(back: string, fd: FormData) {
  const { supabase, ws, user } = await requireWritable('tarefas');
  const v = fields(fd);
  if (v.title.length < 2) flash(back, 'err', 'Descreva a tarefa.');
  const { error } = await supabase.from('tasks').insert({ ...v, status: pick(fd, 'status', STATUS, 'a_fazer'), workspace_id: ws.id, created_by: user.id });
  if (error) flash(back, 'err', dbMessage(error));
  revalidatePath('/tarefas'); revalidatePath('/projetos');
  flash(back, 'ok', 'Tarefa criada.');
}

export async function updateTask(back: string, id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('tarefas');
  const v = fields(fd);
  if (v.title.length < 2) flash(back, 'err', 'Descreva a tarefa.');
  const { error } = await supabase.from('tasks').update({ ...v, status: pick(fd, 'status', STATUS, 'a_fazer') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(back, 'err', dbMessage(error));
  revalidatePath('/tarefas'); revalidatePath('/projetos');
  flash(back, 'ok', 'Tarefa atualizada.');
}

export async function setTaskStatus(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('tarefas');
  await supabase.from('tasks').update({ status: pick(fd, 'status', STATUS, 'a_fazer') }).eq('id', id).eq('workspace_id', ws.id);
  revalidatePath('/tarefas'); revalidatePath('/projetos'); revalidatePath('/dashboard');
}

export async function deleteTask(back: string, id: string) {
  const { supabase, ws } = await requireWritable('tarefas');
  await supabase.from('tasks').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath('/tarefas'); revalidatePath('/projetos');
  flash(back, 'ok', 'Tarefa excluída.');
}
