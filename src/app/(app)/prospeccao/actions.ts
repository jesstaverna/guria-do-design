'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { placesConfigured, searchPlaces } from '@/integrations/google-places';
import { analyzeMany, analyzeNextBatch, analyzeProspect, insertPlaces } from '@/lib/prospecting/pipeline';
import { groupCampaigns, slug } from '@/lib/prospecting/groups';
import { searchQuota } from '@/lib/prospecting/quota';
import { SERVICE_LABEL } from '@/lib/prospecting/services';

const B = '/prospeccao';
const opt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim() || null;
type Ctx = Awaited<ReturnType<typeof requireWritable>>;
type Campaign = { id: string; niche: string; city: string; max_results: number };

/** Busca no Google Maps, grava os prospectos novos e analisa os primeiros. */
async function searchInto(ctx: Ctx, c: Campaign, analyze: boolean) {
  const places = await searchPlaces(c.niche, c.city, c.max_results);
  const { created, dup, ids } = await insertPlaces(ctx.supabase, ctx.ws.id, c.id, places);
  await ctx.supabase.from('prospect_searches').insert({ workspace_id: ctx.ws.id, campaign_id: c.id, niche: c.niche, city: c.city, results: places.length });
  const an = analyze ? await analyzeMany(ctx.supabase, ctx.ws.id, ids, { concurrency: 5, deadlineMs: 35_000 }) : { analyzed: 0, failed: 0, skipped: ids.length };
  return { created, dup, analyzed: an.analyzed, left: ids.length - an.analyzed - an.failed, found: places.length };
}

/** Busca direta: nicho(s) + cidade → reaproveita/cria a campanha, busca no Google Maps e abre o grupo. */
export async function quickSearch(fd: FormData) {
  const ctx = await requireWritable('prospeccao');
  const { supabase, ws } = ctx;
  const picked = [...new Set(fd.getAll('niches').map((v) => String(v).trim()).filter(Boolean))].slice(0, 5);
  const city = String(fd.get('city') ?? '').trim().slice(0, 80);
  const niches = picked.length ? picked : [String(fd.get('niche') ?? '').trim().slice(0, 80)];
  if (city.length < 2) flash(`${B}?tab=buscar`, 'err', 'Informe a cidade (ex.: Curitiba).');
  if (!niches[0] || niches[0].length < 2) flash(`${B}?tab=buscar`, 'err', 'Informe o nicho (ex.: clínica odontológica) ou escolha um tipo nas sugestões.');
  if (!placesConfigured()) flash(`${B}?tab=buscar`, 'err', 'A busca no Google Maps ainda não está ativada nesta instalação. Enquanto isso, use “Cadastrar manualmente”.');
  const q = await searchQuota(supabase, ws.id);
  if (q.left < niches.length) flash(`${B}?tab=buscar`, 'err', q.left <= 0 ? `Você usou todas as ${q.max} buscas do mês no seu plano. Veja “Plano e cobrança” para ampliar.` : `Restam ${q.left} busca(s) neste mês e você pediu ${niches.length}. Escolha menos tipos.`);
  const multi = niches.length > 1;
  const { data: existing } = await supabase.from('prospect_campaigns').select('id, niche, city, max_results').eq('workspace_id', ws.id).eq('status', 'ativa');
  let created = 0, dup = 0, analyzed = 0, left = 0, found = 0, lastKey = '', failed = '';
  for (const niche of niches) {
    const key = `${slug(niche)}--${slug(city)}`;
    let c = existing?.find((x) => `${slug(x.niche)}--${slug(x.city)}` === key) as Campaign | undefined;
    if (!c) {
      const { data, error } = await supabase.from('prospect_campaigns').insert({ workspace_id: ws.id, name: `${niche} (${city})`, niche, city, max_results: 20 }).select('id, niche, city, max_results').single();
      if (error) flash(`${B}?tab=buscar`, 'err', dbMessage(error, 'Não foi possível criar a campanha.'));
      c = data as Campaign;
    }
    try { const r = await searchInto(ctx, c, !multi); created += r.created; dup += r.dup; analyzed += r.analyzed; left += r.left; found += r.found; lastKey = key; }
    catch (e) { failed = e instanceof Error ? e.message : 'erro'; break; }
  }
  if (failed && !found) flash(`${B}?tab=buscar`, 'err', `Falha na busca: ${failed}`);
  revalidatePath(B);
  const dest = multi ? `${B}?tab=prospectos` : `${B}?tab=prospectos&grp=${lastKey}`;
  flash(dest, found ? 'ok' : 'err', found
    ? `${niches.length} busca(s): ${created} prospecto(s) novo(s)${dup ? `, ${dup} já existia(m)` : ''}.${multi ? ' Abra cada grupo para analisar os sites automaticamente.' : ` ${analyzed} analisado(s)${left ? `; ${left} serão analisados em seguida` : ''}.`}${failed ? ` (parou por erro: ${failed})` : ''}`
    : 'O Google Maps não retornou resultados para essa busca. Tente outro termo ou cidade.');
}

export async function addProspect(fd: FormData) {
  const { supabase, ws } = await requireWritable('prospeccao');
  const back = `${B}?tab=novo`;
  const name = opt(fd, 'name');
  if (!name || name.length < 2) flash(back, 'err', 'Informe o nome da empresa.');
  const email = opt(fd, 'email');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) flash(back, 'err', 'E-mail inválido.');
  const { data, error } = await supabase.from('prospects').insert({ workspace_id: ws.id, source: 'manual', name, category: opt(fd, 'category'), website: opt(fd, 'website'), email, phone: opt(fd, 'phone'), address: opt(fd, 'address'), notes: opt(fd, 'notes') }).select('id').single();
  if (error) flash(back, 'err', error.code === '23505' ? 'Já existe um prospecto com este e-mail ou site.' : dbMessage(error));
  await analyzeProspect(supabase, ws.id, data!.id);
  revalidatePath(B);
  flash(`${B}/${data!.id}`, 'ok', 'Prospecto cadastrado e analisado.');
}

export async function analyzeNow(id: string) {
  const { supabase, ws } = await requireWritable('prospeccao');
  const r = await analyzeProspect(supabase, ws.id, id, { site: { withPageSpeed: true } });
  revalidatePath(`${B}/${id}`);
  flash(`${B}/${id}`, r.ok ? 'ok' : 'err', r.ok ? 'Análise atualizada.' : `Falha na análise: ${r.error}`);
}

/** Define como e-mail principal um dos e-mails públicos achados no site (a pessoa escolhe). */
export async function useContactEmail(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('prospeccao');
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const { data: p } = await supabase.from('prospects').select('analysis').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  const allowed = ((p?.analysis as { site?: { emails?: string[] } } | null)?.site?.emails ?? []).includes(email);
  if (!allowed) flash(`${B}/${id}`, 'err', 'Esse e-mail não está entre os encontrados no site.');
  const { error } = await supabase.from('prospects').update({ email, analysis: { ...(p!.analysis as object), email_source: 'site' } }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${B}/${id}`, 'err', error.code === '23505' ? 'Outro prospecto já usa este e-mail.' : dbMessage(error));
  revalidatePath(`${B}/${id}`);
  flash(`${B}/${id}`, 'ok', 'E-mail de contato atualizado.');
}

export async function setProspectStatus(id: string, status: string) {
  const { supabase, ws } = await requireWritable('prospeccao');
  if (!['descartado', 'respondeu', 'contatado', 'analisado'].includes(status)) flash(`${B}/${id}`, 'err', 'Status inválido.');
  const { error } = await supabase.from('prospects').update({ status }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${B}/${id}`, 'err', dbMessage(error));
  revalidatePath(B);
  flash(`${B}/${id}`, 'ok', 'Status atualizado.');
}

export async function saveProspectNotes(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('prospeccao');
  const { error } = await supabase.from('prospects').update({ notes: opt(fd, 'notes') }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${B}/${id}`, 'err', dbMessage(error));
  revalidatePath(`${B}/${id}`);
  flash(`${B}/${id}`, 'ok', 'Anotações salvas.');
}

export async function deleteProspect(id: string) {
  const { supabase, ws } = await requireWritable('prospeccao');
  const { error } = await supabase.from('prospects').delete().eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`${B}/${id}`, 'err', dbMessage(error));
  revalidatePath(B);
  flash(B, 'ok', 'Prospecto excluído.');
}

/** Cria o lead no CRM a partir do prospecto (na primeira etapa do funil). */
export async function convertToLead(prospectId: string) {
  const { supabase, ws, user } = await requireWritable('prospeccao');
  const back = `${B}/${prospectId}`;
  const { data: p } = await supabase.from('prospects').select('*').eq('id', prospectId).eq('workspace_id', ws.id).maybeSingle();
  if (!p) flash(B, 'err', 'Prospecto não encontrado.');
  if (p!.lead_id) flash(back, 'err', 'Já convertido em lead.');
  if (!p!.email && !p!.phone) flash(back, 'err', 'Preencha e-mail ou telefone do prospecto antes de converter.');
  const { data: stage } = await supabase.from('pipeline_stages').select('id').eq('workspace_id', ws.id).eq('kind', 'open').order('position').limit(1).maybeSingle();
  if (!stage) flash(back, 'err', 'Seu funil do CRM não tem uma etapa inicial. Crie uma em CRM.');
  const obs = ((p!.analysis as { observations?: string[] } | null)?.observations ?? []).map((o) => `• ${o}`).join('\n');
  const interest = p!.recommended_service ? SERVICE_LABEL[p!.recommended_service as keyof typeof SERVICE_LABEL] ?? null : null;
  const { data: lead, error } = await supabase.from('leads').insert({ workspace_id: ws.id, name: p!.name, company: p!.name, phone: p!.phone, email: p!.email, source: p!.source === 'google_maps' ? 'Prospecção (Google Maps)' : 'Prospecção', service_interest: interest, stage_id: stage!.id, owner_id: user.id, notes: `Pontuação de oportunidade: ${p!.score ?? '—'}/100\n${obs}`.trim(), created_by: user.id }).select('id').single();
  if (error) flash(back, 'err', error.code === '23505' ? 'Já existe um lead com este e-mail ou telefone no CRM.' : dbMessage(error, 'Não foi possível criar o lead.'));
  await supabase.from('prospects').update({ status: 'convertido', lead_id: lead!.id }).eq('id', prospectId).eq('workspace_id', ws.id);
  revalidatePath(B);
  flash(`/crm/${lead!.id}`, 'ok', 'Prospecto convertido em lead no CRM.');
}

/** Análise em sequência chamada pela tela (lotes de 4). `grp` = chave do grupo, 'manual' ou 'todos'. */
export async function analyzeBatch(grp: string): Promise<{ processed: number; remaining: number; error?: string }> {
  const { supabase, ws } = await requireWritable('prospeccao');
  let scope: { campaignIds?: string[]; manualOnly?: boolean } = {};
  if (grp === 'manual') scope = { manualOnly: true };
  else if (grp !== 'todos') {
    const { data } = await supabase.from('prospect_campaigns').select('id, niche, city, created_at').eq('workspace_id', ws.id);
    const g = groupCampaigns(data ?? []).get(grp);
    if (!g) return { processed: 0, remaining: 0, error: 'Grupo não encontrado.' };
    scope = { campaignIds: g.ids };
  }
  try { const r = await analyzeNextBatch(supabase, ws.id, scope, 4); return { processed: r.processed, remaining: r.remaining }; }
  catch (e) { return { processed: 0, remaining: 0, error: e instanceof Error ? e.message : 'Falha na análise.' }; }
}
