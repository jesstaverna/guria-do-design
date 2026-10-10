'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { date, opt, pick, str, uuid } from '@/lib/forms';
import { FORMATS, NETWORKS, POST_STATUS } from '@/lib/domain';

const NETS = Object.keys(NETWORKS) as [string, ...string[]];
const FMTS = Object.keys(FORMATS) as [string, ...string[]];
const STAT = POST_STATUS.map((s) => s.key) as unknown as readonly ['ideia', ...string[]];

function fields(fd: FormData) {
  return {
    title: str(fd, 'title'), network: pick(fd, 'network', NETS, 'instagram'), format: pick(fd, 'format', FMTS, 'feed'),
    status: pick(fd, 'status', STAT, 'ideia'), client_id: uuid(fd, 'client_id'), pillar_id: uuid(fd, 'pillar_id'), assignee_id: uuid(fd, 'assignee_id'),
    publish_date: date(fd, 'publish_date'), hook: opt(fd, 'hook'), caption: opt(fd, 'caption'), cta: opt(fd, 'cta'), hashtags: opt(fd, 'hashtags'),
    visual_notes: opt(fd, 'visual_notes'), post_url: opt(fd, 'post_url'),
  };
}

export async function createPost(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('conteudo');
  const v = fields(fd);
  if (v.title.length < 2) flash('/conteudo/novo', 'err', 'Dê um título ao conteúdo.');
  const { data, error } = await supabase.from('content_posts').insert({ ...v, workspace_id: ws.id, created_by: user.id }).select('id').single();
  if (error) flash('/conteudo/novo', 'err', dbMessage(error));
  revalidatePath('/conteudo');
  flash(`/conteudo/${data!.id}`, 'ok', 'Conteúdo criado.');
}

export async function updatePost(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('conteudo');
  const v = fields(fd);
  if (v.title.length < 2) flash(`/conteudo/${id}`, 'err', 'Dê um título ao conteúdo.');
  const { error } = await supabase.from('content_posts').update(v).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/conteudo/${id}`, 'err', dbMessage(error));
  revalidatePath('/conteudo');
  flash(`/conteudo/${id}`, 'ok', 'Conteúdo atualizado.');
}

export async function setPostStatus(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('conteudo');
  await supabase.from('content_posts').update({ status: pick(fd, 'status', STAT, 'ideia') }).eq('id', id).eq('workspace_id', ws.id);
  revalidatePath('/conteudo');
}

export async function deletePost(id: string) {
  const { supabase, ws } = await requireWritable('conteudo');
  await supabase.from('content_posts').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath('/conteudo');
  flash('/conteudo', 'ok', 'Conteúdo excluído.');
}

export async function createPillar(fd: FormData) {
  const { supabase, ws } = await requireWritable('conteudo');
  const name = str(fd, 'name');
  if (name.length < 2) flash('/conteudo?view=pilares', 'err', 'Dê um nome ao pilar.');
  const { error } = await supabase.from('content_pillars').insert({ workspace_id: ws.id, name, description: opt(fd, 'description'), client_id: uuid(fd, 'client_id') });
  if (error) flash('/conteudo?view=pilares', 'err', dbMessage(error));
  revalidatePath('/conteudo');
  flash('/conteudo?view=pilares', 'ok', 'Pilar criado.');
}

export async function deletePillar(id: string) {
  const { supabase, ws } = await requireWritable('conteudo');
  await supabase.from('content_pillars').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath('/conteudo');
  flash('/conteudo?view=pilares', 'ok', 'Pilar removido.');
}
