'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { pick, str } from '@/lib/forms';

export async function invite(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('equipe');
  const email = str(fd, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash('/equipe', 'err', 'Informe um e-mail válido.');
  const { error } = await supabase.from('workspace_invites').insert({ workspace_id: ws.id, email, role: pick(fd, 'role', ['member', 'admin'] as const, 'member'), created_by: user.id });
  if (error) flash('/equipe', 'err', dbMessage(error));
  revalidatePath('/equipe');
  flash('/equipe', 'ok', 'Convite criado. Copie o link e envie para a pessoa.');
}

export async function revokeInvite(id: string) {
  const { supabase, ws } = await requireWritable('equipe');
  await supabase.from('workspace_invites').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath('/equipe');
  flash('/equipe', 'ok', 'Convite cancelado.');
}

export async function setRole(memberId: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('equipe');
  const { error } = await supabase.from('workspace_members').update({ role: pick(fd, 'role', ['member', 'admin'] as const, 'member') }).eq('id', memberId).eq('workspace_id', ws.id);
  if (error) flash('/equipe', 'err', dbMessage(error));
  revalidatePath('/equipe');
  flash('/equipe', 'ok', 'Papel atualizado.');
}

export async function removeMember(memberId: string) {
  const { supabase, ws } = await requireWritable('equipe');
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) flash('/equipe', 'err', 'Membro inválido.');
  const { error } = await supabase.from('workspace_members').delete().eq('id', memberId).eq('workspace_id', ws.id);
  if (error) flash('/equipe', 'err', dbMessage(error));
  revalidatePath('/equipe');
  flash('/equipe', 'ok', 'Pessoa removida do espaço.');
}
