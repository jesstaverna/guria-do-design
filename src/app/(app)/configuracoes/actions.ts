'use server';
import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWorkspace, requireWritable } from '@/lib/session';
import { opt, str } from '@/lib/forms';
import { readImage, removeByUrl, uploadPublic } from '@/lib/uploads';

const BACK = '/configuracoes';

export async function saveWorkspace(fd: FormData) {
  const { supabase, ws } = await requireWritable('configuracoes');
  const name = str(fd, 'name');
  if (name.length < 2) flash(BACK, 'err', 'Informe o nome do estúdio.');
  const color = str(fd, 'brand_color') || '#dd00dd';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) flash(BACK, 'err', 'Cor inválida (use #RRGGBB).');
  const tax = Number(str(fd, 'tax_rate_pct').replace(',', '.') || 0);
  if (!(tax >= 0 && tax <= 100)) flash(BACK, 'err', 'Imposto deve estar entre 0 e 100%.');
  const { error } = await supabase.from('workspaces').update({
    name, legal_name: opt(fd, 'legal_name'), document: opt(fd, 'document'), email: opt(fd, 'email'), phone: opt(fd, 'phone'), address: opt(fd, 'address'), city: opt(fd, 'city'),
    website: opt(fd, 'website'), instagram: opt(fd, 'instagram'), brand_color: color, tax_rate_pct: tax,
  }).eq('id', ws.id);
  if (error) flash(BACK, 'err', dbMessage(error));
  revalidatePath('/', 'layout');
  flash(BACK, 'ok', 'Configurações salvas.');
}

export async function uploadLogo(fd: FormData) {
  const { supabase, ws } = await requireWritable('configuracoes');
  const img = await readImage(fd.get('file'));
  if (!img.ok) flash(BACK, 'err', img.error);
  const up = await uploadPublic(supabase, `ws/${ws.id}`, 'logo', img as Extract<typeof img, { ok: true }>);
  if (up.error) flash(BACK, 'err', 'Não foi possível enviar o logotipo. Confira se o armazenamento (migração 0006) foi instalado.');
  const { error } = await supabase.from('workspaces').update({ logo_url: up.url }).eq('id', ws.id);
  if (error) flash(BACK, 'err', dbMessage(error));
  await removeByUrl(supabase, ws.logo_url);
  revalidatePath('/', 'layout');
  flash(BACK, 'ok', 'Logotipo atualizado.');
}

export async function removeLogo() {
  const { supabase, ws } = await requireWritable('configuracoes');
  await supabase.from('workspaces').update({ logo_url: null }).eq('id', ws.id);
  await removeByUrl(supabase, ws.logo_url);
  revalidatePath('/', 'layout');
  flash(BACK, 'ok', 'Logotipo removido.');
}

export async function saveProfile(fd: FormData) {
  const { supabase, user } = await requireWorkspace();
  const name = str(fd, 'full_name');
  if (name.length < 2) flash(BACK, 'err', 'Informe seu nome.');
  await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
  revalidatePath('/', 'layout');
  flash(BACK, 'ok', 'Perfil atualizado.');
}

export async function uploadAvatar(fd: FormData) {
  const { supabase, user, profile } = await requireWorkspace();
  const img = await readImage(fd.get('file'));
  if (!img.ok) flash(BACK, 'err', img.error);
  const up = await uploadPublic(supabase, `users/${user.id}`, 'avatar', img as Extract<typeof img, { ok: true }>);
  if (up.error) flash(BACK, 'err', 'Não foi possível enviar a foto. Confira se o armazenamento (migração 0006) foi instalado.');
  const { error } = await supabase.from('profiles').update({ avatar_url: up.url }).eq('id', user.id);
  if (error) flash(BACK, 'err', dbMessage(error));
  await removeByUrl(supabase, profile.avatar_url);
  revalidatePath('/', 'layout');
  flash(BACK, 'ok', 'Foto atualizada.');
}

export async function removeAvatar() {
  const { supabase, user, profile } = await requireWorkspace();
  await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
  await removeByUrl(supabase, profile.avatar_url);
  revalidatePath('/', 'layout');
  flash(BACK, 'ok', 'Foto removida.');
}
