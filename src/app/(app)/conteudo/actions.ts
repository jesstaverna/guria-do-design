'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWorkspace, requireWritable } from '@/lib/session';
import { date, opt, pick, str, uuid } from '@/lib/forms';
import { FORMATS, NETWORKS } from '@/lib/domain';
import { STAGE_KEYS, normalizeCards, type StageKey } from '@/lib/content';
import { MAX_ATTACHMENT_BYTES, parseLink, safeFileName, validateFile } from '@/lib/attachments';

const BASE = '/conteudo';
const NETS = Object.keys(NETWORKS) as [string, ...string[]];
const FMTS = Object.keys(FORMATS) as [string, ...string[]];
const PRIOS = ['baixa', 'media', 'alta', 'urgente'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const refresh = () => { revalidatePath(BASE); revalidatePath(`${BASE}/calendario`); revalidatePath(`${BASE}/kanban`); revalidatePath(`${BASE}/pilares`); revalidatePath(`${BASE}/acervo`); revalidatePath('/agenda'); revalidatePath('/dashboard'); };

type Result = { ok: true; savedAt: string } | { error: string };

// ---------- autosave seguro: só campos permitidos, cada um validado ----------
const TEXT: Record<string, number> = { title: 200, hook: 500, concept: 1500, keyword: 80, category: 80, caption: 5000, image_prompt: 8000, cover_cta: 300, cta: 300, visual_notes: 3000, internal_notes: 3000, hashtags: 1000, post_url: 500 };
const strArr = (v: unknown, n: number, max: number) => (Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'string') ? (v as string[]).map((x) => x.slice(0, max)) : null);

function validate(field: string, v: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error });
  if (field in TEXT) {
    if (v !== null && typeof v !== 'string') return bad('Texto inválido.');
    const s = (v as string | null) ?? '';
    if (s.length > TEXT[field]) return bad(`Máximo de ${TEXT[field]} caracteres.`);
    if (field === 'title' && s.trim().length < 2) return bad('O título precisa de ao menos 2 letras.');
    if (field === 'post_url' && s && !/^https?:\/\//i.test(s)) return bad('O link precisa começar com http(s)://');
    return { ok: true, value: field === 'title' ? s : s.trim() === '' ? null : s };
  }
  switch (field) {
    case 'priority': return PRIOS.includes(v as never) ? { ok: true, value: v } : bad('Prioridade inválida.');
    case 'format': return FMTS.includes(v as string) ? { ok: true, value: v } : bad('Formato inválido.');
    case 'network': return NETS.includes(v as string) ? { ok: true, value: v } : bad('Rede inválida.');
    case 'pillar_id': case 'assignee_id': return v === null || v === '' ? { ok: true, value: null } : typeof v === 'string' && UUID.test(v) ? { ok: true, value: v } : bad('Seleção inválida.');
    case 'publish_date': return v === null || v === '' ? { ok: true, value: null } : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? { ok: true, value: v } : bad('Data inválida.');
    case 'platform_scheduled_at': return v === null || v === '' ? { ok: true, value: null } : typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? { ok: true, value: new Date(v).toISOString() } : bad('Data/hora inválida.');
    case 'review_required': return typeof v === 'boolean' ? { ok: true, value: v } : bad('Valor inválido.');
    case 'cards': { const c = normalizeCards(v); return c ? { ok: true, value: c } : bad('Um carrossel precisa ter exatamente 7 cards.'); }
    case 'checklist': return Array.isArray(v) && v.length <= 30 && v.every((x) => x && typeof (x as { label?: unknown }).label === 'string' && typeof (x as { done?: unknown }).done === 'boolean')
      ? { ok: true, value: (v as { label: string; done: boolean }[]).map((x) => ({ label: x.label.slice(0, 120), done: x.done })) } : bad('Checklist inválido.');
    case 'reels': case 'stories': return v === null || (typeof v === 'object' && JSON.stringify(v).length < 30_000) ? { ok: true, value: v } : bad('Roteiro inválido.');
    case 'manychat': {
      if (v === null) return { ok: true, value: null };
      const m = v as Record<string, unknown>;
      const replies = strArr(m.public_comment_replies, 3, 500), dms = strArr(m.dm_messages, 3, 2000);
      if (!replies || !dms) return bad('O ManyChat precisa ter 3 respostas públicas e 3 mensagens de direct.');
      return { ok: true, value: { name: String(m.name ?? '').slice(0, 200), channel: 'Instagram', trigger_type: 'comment_keyword', trigger_keyword: String(m.trigger_keyword ?? '').slice(0, 80),
        status: m.status === 'revisado' ? 'revisado' : 'rascunho', enabled: false, public_comment_replies: replies, dm_messages: dms, notes: String(m.notes ?? '').slice(0, 1000), review_required: true } };
    }
    default: return bad('Campo não editável.');
  }
}

export async function savePostPatch(id: string, patch: Record<string, unknown>): Promise<Result> {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  if (!open) return { error: 'Assinatura inativa: modo somente leitura.' };
  if (!UUID.test(id)) return { error: 'Conteúdo inválido.' };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) { const r = validate(k, v); if (!r.ok) return { error: r.error }; row[k] = r.value; }
  if (!Object.keys(row).length) return { error: 'Nada para salvar.' };
  const { error } = await supabase.from('content_posts').update(row).eq('id', id).eq('workspace_id', ws.id);
  if (error) return { error: dbMessage(error) };
  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Kanban (arrastar) e seletor de etapa. Publicado exige data/hora REAIS + confirmação explícita; nunca é inferido da data editorial. */
export async function movePostStage(id: string, stage: StageKey, opts?: { publishedAt?: string; confirmed?: boolean }): Promise<Result> {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  if (!open) return { error: 'Assinatura inativa: modo somente leitura.' };
  if (!UUID.test(id) || !STAGE_KEYS.includes(stage)) return { error: 'Movimento inválido.' };
  const patch: Record<string, unknown> = { status: stage };
  if (stage === 'publicado') {
    const t = opts?.publishedAt ? Date.parse(opts.publishedAt) : NaN;
    if (!opts?.confirmed) return { error: 'Confirme que o conteúdo foi realmente publicado.' };
    if (Number.isNaN(t)) return { error: 'Informe a data e hora reais da publicação.' };
    if (t > Date.now() + 5 * 60_000) return { error: 'A data de publicação não pode estar no futuro.' };
    patch.published_at = new Date(t).toISOString();
  }
  const { error } = await supabase.from('content_posts').update(patch).eq('id', id).eq('workspace_id', ws.id);
  if (error) return { error: dbMessage(error) };
  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

/** Grava a ordem dos cartões de uma coluna do Kanban (arrastar e soltar). */
export async function reorderColumn(ids: string[]): Promise<Result> {
  const { supabase, open } = await requireWorkspace('conteudo');
  if (!open) return { error: 'Assinatura inativa: modo somente leitura.' };
  if (!Array.isArray(ids) || ids.length > 500 || !ids.every((i) => UUID.test(i))) return { error: 'Ordem inválida.' };
  const { error } = await supabase.rpc('kanban_renumber', { p_kind: 'content', p_ids: ids });
  if (error) return { error: dbMessage(error) };
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function reschedulePost(id: string, newDate: string | null): Promise<Result> {
  return savePostPatch(id, { publish_date: newDate });
}

export async function setPostCampaigns(id: string, campaignIds: string[]): Promise<Result> {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  if (!open) return { error: 'Assinatura inativa.' };
  if (!UUID.test(id) || !campaignIds.every((c) => UUID.test(c))) return { error: 'Seleção inválida.' };
  const { data: cur } = await supabase.from('content_post_campaigns').select('campaign_id').eq('post_id', id);
  const have = new Set((cur ?? []).map((r) => r.campaign_id)), want = new Set(campaignIds);
  const add = [...want].filter((c) => !have.has(c)), del = [...have].filter((c) => !want.has(c));
  if (add.length) { const { error } = await supabase.from('content_post_campaigns').insert(add.map((c) => ({ workspace_id: ws.id, post_id: id, campaign_id: c }))); if (error) return { error: dbMessage(error) }; }
  if (del.length) await supabase.from('content_post_campaigns').delete().eq('post_id', id).in('campaign_id', del);
  refresh();
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function createPost(fd: FormData) {
  const { supabase, ws, user } = await requireWritable('conteudo');
  const title = str(fd, 'title');
  if (title.length < 2) flash(`${BASE}/novo`, 'err', 'Dê um título ao conteúdo.');
  const d = date(fd, 'publish_date');
  const { data, error } = await supabase.from('content_posts').insert({
    workspace_id: ws.id, title, network: pick(fd, 'network', NETS, 'instagram'), format: pick(fd, 'format', FMTS, 'carrossel'), pillar_id: uuid(fd, 'pillar_id'),
    publish_date: d, bucket: d ? 'calendario' : 'ideia', status: 'ideia', keyword: opt(fd, 'keyword'), client_id: uuid(fd, 'client_id'), created_by: user.id,
  }).select('id').single();
  if (error) flash(`${BASE}/novo`, 'err', dbMessage(error));
  refresh();
  flash(`${BASE}/${data!.id}`, 'ok', 'Conteúdo criado.');
}

export async function deletePost(id: string) {
  const { supabase, ws } = await requireWritable('conteudo');
  const { error } = await supabase.from('content_posts').delete().eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${BASE}/${id}`, 'err', dbMessage(error));
  refresh();
  flash(`${BASE}/calendario`, 'ok', 'Conteúdo excluído.');
}

// ---------- pilares e campanhas ----------
export async function savePillar(fd: FormData) {
  const { supabase, ws } = await requireWritable('conteudo');
  const id = uuid(fd, 'id'), name = str(fd, 'name');
  const back = `${BASE}/pilares`;
  if (name.length < 2) flash(back, 'err', 'Dê um nome ao pilar.');
  const color = str(fd, 'color') || '#B00BB5';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) flash(back, 'err', 'Cor inválida.');
  const row = { name, description: opt(fd, 'description'), objective: opt(fd, 'objective'), color, position: Math.min(Math.max(parseInt(str(fd, 'position'), 10) || 0, 0), 99) };
  const { error } = id ? await supabase.from('content_pillars').update(row).eq('id', id).eq('workspace_id', ws.id) : await supabase.from('content_pillars').insert({ ...row, workspace_id: ws.id });
  if (error) flash(back, 'err', dbMessage(error));
  refresh();
  flash(back, 'ok', 'Pilar salvo.');
}

export async function togglePillar(id: string, active: boolean) {
  const { supabase, ws } = await requireWritable('conteudo');
  await supabase.from('content_pillars').update({ active }).eq('id', id).eq('workspace_id', ws.id);
  refresh();
  flash(`${BASE}/pilares`, 'ok', active ? 'Pilar ativado.' : 'Pilar desativado (os conteúdos continuam vinculados).');
}

export async function deletePillar(id: string) {
  const { supabase, ws } = await requireWritable('conteudo');
  const { count } = await supabase.from('content_posts').select('id', { count: 'exact', head: true }).eq('pillar_id', id);
  if (count) flash(`${BASE}/pilares`, 'err', `Este pilar tem ${count} conteúdo(s). Desative-o em vez de excluir.`);
  await supabase.from('content_pillars').delete().eq('id', id).eq('workspace_id', ws.id);
  refresh();
  flash(`${BASE}/pilares`, 'ok', 'Pilar excluído.');
}

export async function saveCampaign(fd: FormData) {
  const { supabase, ws } = await requireWritable('conteudo');
  const name = str(fd, 'name'), back = `${BASE}/pilares`;
  if (name.length < 2) flash(back, 'err', 'Dê um nome à campanha.');
  const { error } = await supabase.from('content_campaigns').insert({ workspace_id: ws.id, name, period: opt(fd, 'period'), notes: opt(fd, 'notes') });
  if (error) flash(back, 'err', dbMessage(error));
  refresh();
  flash(back, 'ok', 'Campanha criada.');
}

export async function deleteCampaign(id: string) {
  const { supabase, ws } = await requireWritable('conteudo');
  await supabase.from('content_campaigns').delete().eq('id', id).eq('workspace_id', ws.id);
  refresh();
  flash(`${BASE}/pilares`, 'ok', 'Campanha removida (os conteúdos continuam).');
}

// ---------- importação controlada (somente administradores) ----------
export async function previewImport(fd: FormData) {
  const { supabase, ws, isAdmin } = await requireWritable('conteudo');
  const back = `${BASE}/importar`;
  if (!isAdmin) flash(back, 'err', 'Somente administradores podem importar.');
  const f = fd.get('file');
  if (!(f instanceof File) || f.size === 0) flash(back, 'err', 'Escolha o arquivo .json do planejamento.');
  if ((f as File).size > 3_500_000) flash(back, 'err', 'Arquivo grande demais (máximo 3,5 MB).');
  let plan: unknown;
  try { plan = JSON.parse(await (f as File).text()); } catch { flash(back, 'err', 'O arquivo não é um JSON válido.'); }
  const p = plan as Record<string, unknown>;
  if (!p || typeof p !== 'object' || !Array.isArray(p.scheduled_posts) || !Array.isArray(p.pillars)) flash(back, 'err', 'Formato não reconhecido: faltam as listas scheduled_posts e pillars.');
  const { data, error } = await supabase.rpc('content_import_preview', { p_ws: ws.id, p_plan: plan, p_file: (f as File).name });
  if (error) flash(back, 'err', dbMessage(error, 'Não foi possível analisar o arquivo. A migração 0008 foi instalada?'));
  flash(`${back}?run=${data}`, 'ok', 'Ensaio concluído: nada foi gravado. Revise o relatório.');
}

export async function applyImport(runId: string) {
  const { supabase, isAdmin } = await requireWritable('conteudo');
  const back = `${BASE}/importar`;
  if (!isAdmin || !UUID.test(runId)) flash(back, 'err', 'Sem permissão.');
  const { error } = await supabase.rpc('content_import_apply', { p_run: runId });
  if (error) flash(`${back}?run=${runId}`, 'err', dbMessage(error, 'Não foi possível aplicar a importação.'));
  refresh();
  flash(`${back}?run=${runId}`, 'ok', 'Importação aplicada. Nada foi publicado, agendado ou ativado.');
}

export async function discardImport(runId: string) {
  const { supabase, isAdmin } = await requireWritable('conteudo');
  if (!isAdmin || !UUID.test(runId)) flash(`${BASE}/importar`, 'err', 'Sem permissão.');
  await supabase.rpc('content_import_discard', { p_run: runId });
  flash(`${BASE}/importar`, 'ok', 'Ensaio descartado.');
}

// ---------- anexos do post (arquivos reais ou links; nada é inventado) ----------
export async function prepareContentUpload(postId: string, fileName: string, size: number): Promise<{ path: string; token: string } | { error: string }> {
  const { supabase, ws } = await requireWritable('conteudo');
  const bad = validateFile(fileName, size);
  if (bad) return { error: bad };
  const { data: post } = await supabase.from('content_posts').select('id').eq('id', postId).eq('workspace_id', ws.id).maybeSingle();
  if (!post) return { error: 'Conteúdo não encontrado.' };
  const path = `ws/${ws.id}/content/${postId}/${randomUUID()}-${safeFileName(fileName)}`;
  const { data, error } = await supabase.storage.from('attachments').createSignedUploadUrl(path);
  if (error || !data) return { error: 'Não foi possível preparar o envio. Confira se a migração de anexos foi instalada.' };
  return { path, token: data.token };
}

export async function registerContentAttachment(postId: string, path: string, name: string, size: number, mime: string): Promise<{ ok: true } | { error: string }> {
  const { supabase, ws, user } = await requireWritable('conteudo');
  if (!path.startsWith(`ws/${ws.id}/content/${postId}/`)) return { error: 'Caminho inválido.' };
  if (size > MAX_ATTACHMENT_BYTES) return { error: 'Arquivo grande demais.' };
  if ((await supabase.storage.from('attachments').createSignedUrl(path, 10)).error) return { error: 'O arquivo não foi encontrado após o envio. Tente novamente.' };
  const { error } = await supabase.from('content_attachments').insert({ workspace_id: ws.id, post_id: postId, kind: 'arquivo', provider: 'upload', name: name.slice(0, 200), path, mime: mime || null, size_bytes: size, created_by: user.id });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`${BASE}/${postId}`);
  return { ok: true };
}

export async function addContentLink(postId: string, fd: FormData) {
  const { supabase, ws, user } = await requireWritable('conteudo');
  const back = `${BASE}/${postId}?tab=anexos`;
  const link = parseLink(str(fd, 'url'));
  if (!link) flash(back, 'err', 'Cole um link válido começando com https://');
  const provider = str(fd, 'provider') === 'google_drive' ? 'google_drive' : link!.provider;
  const { error } = await supabase.from('content_attachments').insert({ workspace_id: ws.id, post_id: postId, kind: 'link', provider, name: (str(fd, 'name') || (provider === 'google_drive' ? 'Arquivo no Google Drive' : link!.host)).slice(0, 200), url: link!.url, created_by: user.id });
  if (error) flash(back, 'err', dbMessage(error));
  revalidatePath(`${BASE}/${postId}`);
  flash(back, 'ok', 'Link anexado.');
}

export async function removeContentAttachment(postId: string, id: string) {
  const { supabase, ws } = await requireWritable('conteudo');
  const { data: a } = await supabase.from('content_attachments').select('id, path').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (a) { await supabase.from('content_attachments').delete().eq('id', id); if (a.path) await supabase.storage.from('attachments').remove([a.path]); }
  revalidatePath(`${BASE}/${postId}`);
  flash(`${BASE}/${postId}?tab=anexos`, 'ok', 'Anexo removido.');
}

/** Dar uma data a um item do acervo/ideias é uma ação explícita: ele passa para o calendário (editorial; não agenda em rede social). */
export async function scheduleFromReserve(id: string, fd: FormData) {
  const d = date(fd, 'publish_date');
  const back = `${BASE}/acervo`;
  if (!d) flash(back, 'err', 'Escolha a data editorial.');
  const r = await savePostPatch(id, { publish_date: d });
  if ('error' in r) flash(back, 'err', r.error);
  flash(back, 'ok', 'Conteúdo levado ao calendário (data editorial). Nada foi agendado em rede social.');
}
