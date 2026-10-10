'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { opt, pick, str } from '@/lib/forms';

function fields(fd: FormData) {
  return {
    name: str(fd, 'name'), company: opt(fd, 'company'), email: opt(fd, 'email')?.toLowerCase() ?? null, phone: opt(fd, 'phone'),
    document: opt(fd, 'document'), address: opt(fd, 'address'), city: opt(fd, 'city'), segment: opt(fd, 'segment'),
    instagram: opt(fd, 'instagram'), website: opt(fd, 'website'), notes: opt(fd, 'notes'),
    status: pick(fd, 'status', ['ativo', 'pausado', 'encerrado'] as const, 'ativo'),
  };
}

export async function createClientAction(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('clientes');
  const v = fields(fd);
  if (v.name.length < 2) flash('/clientes/novo', 'err', 'Informe o nome do cliente.');
  const { data, error } = await supabase.from('clients').insert({ ...v, workspace_id: ws.id, created_by: user.id }).select('id').single();
  if (error) flash('/clientes/novo', 'err', dbMessage(error));
  revalidatePath('/clientes');
  flash(`/clientes/${data!.id}`, 'ok', 'Cliente cadastrado.');
}

export async function updateClientAction(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('clientes');
  const v = fields(fd);
  if (v.name.length < 2) flash(`/clientes/${id}`, 'err', 'Informe o nome do cliente.');
  const { error } = await supabase.from('clients').update(v).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/clientes/${id}`, 'err', dbMessage(error));
  revalidatePath('/clientes');
  flash(`/clientes/${id}`, 'ok', 'Cliente atualizado.');
}
