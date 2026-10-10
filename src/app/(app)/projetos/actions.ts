'use server';
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
