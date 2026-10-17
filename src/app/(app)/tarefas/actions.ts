'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { date, opt, pick, str, uuid } from '@/lib/forms';
import { MAX_ATTACHMENT_BYTES, parseLink, safeFileName, validateFile } from '@/lib/attachments';

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
  const { data: before } = await supabase.from('tasks').select('due_date, chain_pos').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  // etapa do onboarding com prazo novo: as etapas seguintes acompanham (cronograma que se ajusta). Precisa rodar ANTES de gravar a data nova.
  let shifted = 0;
  if (before?.chain_pos != null && before.due_date && v.due_date && before.due_date !== v.due_date) {
    const { error: e2, data } = await supabase.rpc('shift_chain', { p_task: id, p_new_due: v.due_date });
    if (!e2) shifted = Number(data ?? 0);
  }
  const { error } = await supabase.from('tasks').update({ ...v, status: pick(fd, 'status', STATUS, 'a_fazer') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(back, 'err', dbMessage(error));
  revalidatePath('/tarefas'); revalidatePath('/projetos');
  flash(back, 'ok', shifted > 0 ? `Tarefa atualizada. ${shifted} etapa(s) seguinte(s) do cronograma foram ajustadas.` : 'Tarefa atualizada.');
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

// ---------- anexos ----------
const ATT = 'attachments';

/** 1º passo do upload direto: valida e devolve URL assinada de envio (o arquivo vai do navegador ao Supabase, sem passar pelo servidor). */
export async function prepareUpload(taskId: string, fileName: string, size: number): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase, ws } = await requireWritable('tarefas');
  const bad = validateFile(fileName, size);
  if (bad) return { error: bad };
  const { data: task } = await supabase.from('tasks').select('id').eq('id', taskId).eq('workspace_id', ws.id).maybeSingle();
  if (!task) return { error: 'Tarefa não encontrada.' };
  const path = `ws/${ws.id}/tasks/${taskId}/${randomUUID()}-${safeFileName(fileName)}`;
  const { data, error } = await supabase.storage.from(ATT).createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível preparar o envio. Confira se a migração 0007 (anexos) foi instalada.' };
  return { path, token: data.token };
}

/** 2º passo: registra o anexo depois do envio. Confere que o arquivo realmente existe e pertence à tarefa. */
export async function registerAttachment(taskId: string, path: string, name: string, size: number, mime: string): Promise<{ ok: true } | { error: string }> {
  const { supabase, ws, user } = await requireWritable('tarefas');
  if (!path.startsWith(`ws/${ws.id}/tasks/${taskId}/`)) return { error: 'Caminho inválido.' };
  if (size > MAX_ATTACHMENT_BYTES) return { error: 'Arquivo grande demais.' };
  const probe = await supabase.storage.from(ATT).createSignedUrl(path, 10);
  if (probe.error) return { error: 'O arquivo não foi encontrado após o envio. Tente novamente.' };
  const { error } = await supabase.from('task_attachments').insert({
    workspace_id: ws.id, task_id: taskId, kind: 'arquivo', provider: 'upload', name: name.slice(0, 200), path, mime: mime || null, size_bytes: size, created_by: user.id,
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/tarefas/${taskId}`); revalidatePath('/tarefas');
  return { ok: true };
}

/** Anexa um link (Google Drive, Figma, Canva...). */
export async function addLink(taskId: string, fd: FormData) {
  const { supabase, ws, user } = await requireWritable('tarefas');
  const back = `/tarefas/${taskId}`;
  const link = parseLink(str(fd, 'url'));
  if (!link) flash(back, 'err', 'Cole um link válido começando com https://');
  const forced = str(fd, 'provider') === 'google_drive' ? 'google_drive' : link!.provider;
  const name = str(fd, 'name') || (forced === 'google_drive' ? 'Arquivo no Google Drive' : link!.host);
  const { error } = await supabase.from('task_attachments').insert({ workspace_id: ws.id, task_id: taskId, kind: 'link', provider: forced, name: name.slice(0, 200), url: link!.url, created_by: user.id });
  if (error) flash(back, 'err', dbMessage(error, 'Não foi possível anexar o link. Confira se a migração 0007 foi instalada.'));
  revalidatePath(back); revalidatePath('/tarefas');
  flash(back, 'ok', 'Link anexado.');
}

export async function removeAttachment(taskId: string, id: string) {
  const { supabase, ws } = await requireWritable('tarefas');
  const { data: a } = await supabase.from('task_attachments').select('id, path').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (a) {
    await supabase.from('task_attachments').delete().eq('id', id).eq('workspace_id', ws.id);
    if (a.path) await supabase.storage.from(ATT).remove([a.path]);
  }
  revalidatePath(`/tarefas/${taskId}`); revalidatePath('/tarefas');
  flash(`/tarefas/${taskId}`, 'ok', 'Anexo removido.');
}
