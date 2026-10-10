'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable } from '@/lib/session';
import { cents, date, int, opt, pick, str, uuid } from '@/lib/forms';
import { todayBR } from '@/lib/domain';

const BASE = '/financeiro';

export async function createTransaction(back: string, fd: FormData) {
  const { supabase, ws, user } = await requireWritable('financeiro');
  const amount = cents(fd, 'amount'), due = date(fd, 'due_date');
  const description = str(fd, 'description');
  if (description.length < 2) flash(back, 'err', 'Descreva o lançamento.');
  if (!amount || amount <= 0) flash(back, 'err', 'Informe um valor maior que zero.');
  if (!due) flash(back, 'err', 'Informe o vencimento.');
  const paid = fd.get('paid') === 'on';
  const { error } = await supabase.from('fin_transactions').insert({
    workspace_id: ws.id, direction: pick(fd, 'direction', ['in', 'out'] as const, 'in'), description, amount_cents: amount!, due_date: due!,
    status: paid ? 'pago' : 'previsto', paid_date: paid ? due! : null, category_id: uuid(fd, 'category_id'), client_id: uuid(fd, 'client_id'), notes: opt(fd, 'notes'), created_by: user.id,
  });
  if (error) flash(back, 'err', dbMessage(error));
  revalidatePath(BASE); revalidatePath('/dashboard');
  flash(back, 'ok', 'Lançamento salvo.');
}

export async function settle(back: string, id: string, fd: FormData) {
  const { supabase, ws } = await requireWritable('financeiro');
  const paidDate = date(fd, 'paid_date') ?? todayBR();
  const { error } = await supabase.from('fin_transactions').update({ status: 'pago', paid_date: paidDate }).eq('id', id).eq('workspace_id', ws.id);
  if (error) flash(back, 'err', dbMessage(error));
  revalidatePath(BASE); revalidatePath('/dashboard');
  flash(back, 'ok', 'Baixa registrada.');
}

export async function reopen(back: string, id: string) {
  const { supabase, ws } = await requireWritable('financeiro');
  await supabase.from('fin_transactions').update({ status: 'previsto', paid_date: null }).eq('id', id).eq('workspace_id', ws.id);
  revalidatePath(BASE); revalidatePath('/dashboard');
  flash(back, 'ok', 'Baixa desfeita.');
}

export async function removeTransaction(back: string, id: string) {
  const { supabase, ws } = await requireWritable('financeiro');
  await supabase.from('fin_transactions').delete().eq('id', id).eq('workspace_id', ws.id);
  revalidatePath(BASE); revalidatePath('/dashboard');
  flash(back, 'ok', 'Lançamento excluído.');
}

export async function createRecurring(fd: FormData) {
  const { supabase, ws } = await requireWritable('financeiro');
  const amount = cents(fd, 'amount'), start = date(fd, 'start_date'), description = str(fd, 'description');
  const back = `${BASE}?tab=recorrencias`;
  if (description.length < 2 || !amount || !start) flash(back, 'err', 'Informe descrição, valor e data de início.');
  const { error } = await supabase.from('fin_recurring').insert({
    workspace_id: ws.id, direction: pick(fd, 'direction', ['in', 'out'] as const, 'out'), description, amount_cents: amount!, day_of_month: Math.min(Math.max(int(fd, 'day_of_month', 5), 1), 28),
    start_date: start!, end_date: date(fd, 'end_date'), category_id: uuid(fd, 'category_id'), client_id: uuid(fd, 'client_id'),
  });
  if (error) flash(back, 'err', dbMessage(error));
  const { error: e2 } = await supabase.rpc('generate_recurring_now', { p_ws: ws.id });
  revalidatePath(BASE);
  flash(back, e2 ? 'err' : 'ok', e2 ? 'Recorrência salva, mas não foi possível gerar os lançamentos.' : 'Recorrência salva e lançamentos gerados.');
}

export async function toggleRecurring(id: string, active: boolean) {
  const { supabase, ws } = await requireWritable('financeiro');
  await supabase.from('fin_recurring').update({ active }).eq('id', id).eq('workspace_id', ws.id);
  revalidatePath(BASE);
  flash(`${BASE}?tab=recorrencias`, 'ok', active ? 'Recorrência reativada.' : 'Recorrência pausada (lançamentos já gerados permanecem).');
}

export async function generateNow() {
  const { supabase, ws } = await requireWritable('financeiro');
  const { data, error } = await supabase.rpc('generate_recurring_now', { p_ws: ws.id });
  revalidatePath(BASE);
  flash(`${BASE}?tab=recorrencias`, error ? 'err' : 'ok', error ? dbMessage(error) : `${data} lançamento(s) gerado(s).`);
}
