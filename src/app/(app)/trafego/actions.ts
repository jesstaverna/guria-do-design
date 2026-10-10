'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { cents, date, int, opt, pick, str, uuid } from '@/lib/forms';
import { AD_OBJECTIVES, AD_PLATFORMS, parseAdCsv } from '@/lib/domain';

const PLAT = Object.keys(AD_PLATFORMS) as [string, ...string[]];
const OBJ = Object.keys(AD_OBJECTIVES) as [string, ...string[]];
const ST = ['planejada', 'ativa', 'pausada', 'encerrada'] as const;

function fields(fd: FormData) {
  return {
    name: str(fd, 'name'), client_id: uuid(fd, 'client_id'), platform: pick(fd, 'platform', PLAT, 'meta'), objective: pick(fd, 'objective', OBJ, 'leads'),
    status: pick(fd, 'status', ST, 'ativa'), daily_budget_cents: cents(fd, 'daily_budget') ?? 0, target_cpl_cents: cents(fd, 'target_cpl'),
    start_date: date(fd, 'start_date'), end_date: date(fd, 'end_date'), notes: opt(fd, 'notes'),
  };
}

export async function createCampaign(fd: FormData) {
  const { supabase, ws } = await requireWritable('trafego');
  const v = fields(fd);
  if (v.name.length < 2) flash('/trafego', 'err', 'Dê um nome à campanha.');
  const { data, error } = await supabase.from('ad_campaigns').insert({ ...v, workspace_id: ws.id }).select('id').single();
  if (error) flash('/trafego', 'err', dbMessage(error));
  revalidatePath('/trafego');
  flash(`/trafego/${data!.id}`, 'ok', 'Campanha criada. Lance as métricas diárias ou importe um CSV.');
}

export async function updateCampaign(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('trafego');
  const v = fields(fd);
  if (v.name.length < 2) flash(`/trafego/${id}`, 'err', 'Dê um nome à campanha.');
  const { error } = await supabase.from('ad_campaigns').update(v).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(`/trafego/${id}`, 'err', dbMessage(error));
  revalidatePath('/trafego');
  flash(`/trafego/${id}`, 'ok', 'Campanha atualizada.');
}

export async function saveMetric(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('trafego');
  const day = date(fd, 'day');
  if (!day) flash(`/trafego/${id}`, 'err', 'Informe a data.');
  const row = {
    workspace_id: ws.id, campaign_id: id, day: day!, spend_cents: cents(fd, 'spend') ?? 0, impressions: Math.max(int(fd, 'impressions'), 0), clicks: Math.max(int(fd, 'clicks'), 0),
    leads: Math.max(int(fd, 'leads'), 0), conversions: Math.max(int(fd, 'conversions'), 0), revenue_cents: cents(fd, 'revenue') ?? 0,
  };
  const { error } = await supabase.from('ad_metrics_daily').upsert(row, { onConflict: 'campaign_id,day' });
  if (error) flash(`/trafego/${id}`, 'err', dbMessage(error));
  revalidatePath(`/trafego/${id}`);
  flash(`/trafego/${id}`, 'ok', 'Métricas do dia salvas.');
}

export async function importCsv(id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('trafego');
  const { rows, errors } = parseAdCsv(str(fd, 'csv'));
  if (!rows.length) flash(`/trafego/${id}`, 'err', errors[0] ?? 'Nenhuma linha válida encontrada.');
  const { error } = await supabase.from('ad_metrics_daily').upsert(rows.map((r) => ({ ...r, workspace_id: ws.id, campaign_id: id })), { onConflict: 'campaign_id,day' });
  if (error) flash(`/trafego/${id}`, 'err', dbMessage(error));
  revalidatePath(`/trafego/${id}`);
  flash(`/trafego/${id}`, errors.length ? 'err' : 'ok', `${rows.length} dia(s) importado(s)${errors.length ? `; ${errors.length} linha(s) ignorada(s): ${errors[0]}` : '.'}`);
}

export async function deleteMetric(id: string, metricId: string) {
  const { supabase, ws } = await requireWritable('trafego');
  await supabase.from('ad_metrics_daily').delete().eq('id', metricId).eq('workspace_id', ws.id);
  revalidatePath(`/trafego/${id}`);
  flash(`/trafego/${id}`, 'ok', 'Registro removido.');
}
