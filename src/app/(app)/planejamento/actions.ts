'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { date, str } from '@/lib/forms';
import { GOAL_KINDS, monthRange, parseCents } from '@/lib/domain';

const BASE = '/planejamento';

export async function createGoal(fd: FormData) {
  const { supabase, ws } = await requireWritable('planejamento');
  const kind = str(fd, 'kind');
  if (!(kind in GOAL_KINDS)) flash(BASE, 'err', 'Escolha o tipo de meta.');
  let from = date(fd, 'period_start'), to = date(fd, 'period_end');
  const month = str(fd, 'month');
  if (/^\d{4}-\d{2}$/.test(month)) { const [y, m] = month.split('-').map(Number); ({ from: from, to: to } = monthRange(y, m)); }
  if (!from || !to || to < from) flash(BASE, 'err', 'Informe um período válido.');
  const raw = str(fd, 'target');
  const target = GOAL_KINDS[kind].money ? parseCents(raw) : Number(raw.replace(',', '.'));
  if (!target || target <= 0 || !Number.isFinite(target)) flash(BASE, 'err', 'Informe uma meta maior que zero.');
  const { error } = await supabase.from('goals').insert({ workspace_id: ws.id, kind, period_start: from!, period_end: to!, target: target!, note: str(fd, 'note') || null });
  if (error) flash(BASE, 'err', error.code === '23505' ? 'Já existe uma meta deste tipo para o período.' : dbMessage(error));
  revalidatePath(BASE); revalidatePath('/dashboard');
  flash(BASE, 'ok', 'Meta criada.');
}

export async function deleteGoal(id: string) {
  const { supabase, ws } = await requireWritable('planejamento');
  await supabase.from('goals').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath(BASE); revalidatePath('/dashboard');
  flash(BASE, 'ok', 'Meta removida.');
}

export async function saveBudget(month: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('planejamento');
  if (!/^\d{4}-\d{2}$/.test(month)) flash(BASE, 'err', 'Mês inválido.');
  const rows: { workspace_id: string; category_id: string; month: string; planned_cents: number }[] = [];
  const clear: string[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('cat_')) continue;
    const cid = /^[0-9a-f-]{36}$/i.test(k.slice(4)) ? k.slice(4) : null;
    if (!cid) continue;
    const c = parseCents(String(v));
    if (c == null) clear.push(cid); else rows.push({ workspace_id: ws.id, category_id: cid, month: `${month}-01`, planned_cents: c });
  }
  if (rows.length) {
    const { error } = await supabase.from('budgets').upsert(rows, { onConflict: 'category_id,month' });
    if (error) flash(`${BASE}?m=${month}`, 'err', dbMessage(error));
  }
  if (clear.length) await supabase.from('budgets').delete().eq('workspace_id', ws.id).eq('month', `${month}-01`).in('category_id', clear);
  revalidatePath(BASE);
  flash(`${BASE}?m=${month}`, 'ok', 'Orçamento do mês salvo.');
}
