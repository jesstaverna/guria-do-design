import type { SupabaseClient } from '@supabase/supabase-js';
import { analyzeSite } from '@/integrations/site-analyzer';
import type { SafeFetchOptions } from '@/integrations/net-safe';
import { scoreProspect } from './analysis';
import { runPool } from './pool';
import { pickBestEmail } from './emails';
import type { PlaceResult } from './places-map';

/** Grava resultados do Google Maps como prospectos do estúdio (ignora duplicados por local, e-mail ou domínio). */
export async function insertPlaces(db: SupabaseClient, wsId: string, campaignId: string, places: PlaceResult[]) {
  let created = 0, dup = 0; const ids: string[] = [];
  for (const p of places) {
    const { data, error } = await db.from('prospects').insert({ workspace_id: wsId, campaign_id: campaignId, source: 'google_maps', place_id: p.place_id, name: p.name, category: p.category, address: p.address, phone: p.phone, website: p.website, rating: p.rating, reviews_count: p.reviews_count, maps_url: p.maps_url, google_fetched_at: new Date().toISOString() }).select('id').single();
    if (error) { if (error.code === '23505') dup++; continue; }
    created++; ids.push(data!.id);
  }
  return { created, dup, ids };
}

export interface AnalyzeOptions { site?: SafeFetchOptions & { withPageSpeed?: boolean } }

/** Analisa um prospecto (site público), calcula a pontuação de oportunidade e guarda o resultado. Idempotente. */
export async function analyzeProspect(db: SupabaseClient, wsId: string, prospectId: string, opts: AnalyzeOptions = {}): Promise<{ ok: boolean; error?: string }> {
  const { data: p, error } = await db.from('prospects').select('id, website, phone, email, rating, reviews_count, status').eq('id', prospectId).eq('workspace_id', wsId).maybeSingle();
  if (error || !p) return { ok: false, error: error?.message ?? 'Prospecto não encontrado' };
  const site = p.website ? await analyzeSite(p.website, opts.site) : null;
  // sem e-mail cadastrado: usa um e-mail comercial público encontrado no próprio site da empresa
  let email: string | null = p.email; let emailSource: string | undefined;
  if (!email && site?.emails?.length) {
    const host = p.website ? new URL(/^https?:/i.test(p.website) ? p.website : `https://${p.website}`).hostname : null;
    const best = pickBestEmail(site.emails, host);
    if (best) { const { error: eErr } = await db.from('prospects').update({ email: best }).eq('id', p.id).eq('workspace_id', wsId); if (!eErr) { email = best; emailSource = 'site'; } }
  }
  const scored = scoreProspect({ hasWebsite: !!p.website, site, rating: p.rating == null ? null : Number(p.rating), reviews: p.reviews_count, contact: { email, phone: p.phone } });
  const analysis = { site, reasons: [...scored.reasons, ...scored.contactReasons], need_score: scored.need, needs: scored.buckets, contact_bonus: scored.contactBonus, observations: scored.observations, analyzed_with: 'regras-v2', ...(emailSource ? { email_source: emailSource } : {}) };
  const { error: uErr } = await db.from('prospects').update({ analysis, score: scored.score, recommended_service: scored.service, analyzed_at: new Date().toISOString(), analysis_error: null, ...(p.status === 'novo' ? { status: 'analisado' } : {}) }).eq('id', p.id).eq('workspace_id', wsId);
  return uErr ? { ok: false, error: uErr.message } : { ok: true };
}

/** Analisa vários prospectos em paralelo limitado, parando de iniciar novos após o prazo. */
export async function analyzeMany(db: SupabaseClient, wsId: string, ids: string[], opts: { concurrency?: number; deadlineMs?: number; site?: AnalyzeOptions['site'] } = {}) {
  const { results, skipped } = await runPool(ids, opts.concurrency ?? 5, async (id) => {
    const r = await analyzeProspect(db, wsId, id, { site: opts.site });
    // falha definitiva: marca como tentada para a fila automática não repetir para sempre
    if (!r.ok) await db.from('prospects').update({ analysis_error: r.error?.slice(0, 300), analyzed_at: new Date().toISOString() }).eq('id', id).eq('workspace_id', wsId);
    return r.ok;
  }, opts.deadlineMs ?? Infinity);
  return { analyzed: results.filter(Boolean).length, failed: results.filter((x) => !x).length, skipped: skipped.length };
}

/** Pega os próximos `n` prospectos novos sem análise (de certas campanhas, ou só os manuais) e analisa. */
export async function analyzeNextBatch(db: SupabaseClient, wsId: string, scope: { campaignIds?: string[]; manualOnly?: boolean } = {}, n = 4) {
  const pending = () => {
    let q = db.from('prospects').select('id', { count: 'exact' }).eq('workspace_id', wsId).eq('status', 'novo').is('analyzed_at', null);
    if (scope.manualOnly) q = q.is('campaign_id', null); else if (scope.campaignIds) q = q.in('campaign_id', scope.campaignIds);
    return q;
  };
  const { data } = await pending().order('created_at').limit(n);
  const ids = (data ?? []).map((r) => r.id);
  const r = ids.length ? await analyzeMany(db, wsId, ids, { concurrency: n }) : { analyzed: 0, failed: 0, skipped: 0 };
  const { count } = await pending().limit(1);
  return { processed: ids.length, analyzed: r.analyzed, failed: r.failed, remaining: count ?? 0 };
}
