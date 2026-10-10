import { revalidatePath } from 'next/cache';
import { dbMessage, flash, requireWritable, requireWorkspace } from '@/lib/session';
import { Field, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { opt, str } from '@/lib/forms';

export const metadata = { title: 'Configurações' };

async function save(fd: FormData) {
  'use server';
  const { supabase, ws } = await requireWritable('configuracoes');
  const name = str(fd, 'name');
  if (name.length < 2) flash('/configuracoes', 'err', 'Informe o nome do estúdio.');
  const color = str(fd, 'brand_color') || '#dd00dd';
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) flash('/configuracoes', 'err', 'Cor inválida (use #RRGGBB).');
  const tax = Number(str(fd, 'tax_rate_pct').replace(',', '.') || 0);
  if (!(tax >= 0 && tax <= 100)) flash('/configuracoes', 'err', 'Imposto deve estar entre 0 e 100%.');
  const logo = opt(fd, 'logo_url');
  if (logo && !/^https:\/\//i.test(logo)) flash('/configuracoes', 'err', 'O endereço do logotipo deve começar com https://');
  const { error } = await supabase.from('workspaces').update({
    name, legal_name: opt(fd, 'legal_name'), document: opt(fd, 'document'), email: opt(fd, 'email'), phone: opt(fd, 'phone'), address: opt(fd, 'address'), city: opt(fd, 'city'),
    website: opt(fd, 'website'), instagram: opt(fd, 'instagram'), logo_url: logo, brand_color: color, tax_rate_pct: tax,
  }).eq('id', ws.id);
  if (error) flash('/configuracoes', 'err', dbMessage(error));
  revalidatePath('/', 'layout');
  flash('/configuracoes', 'ok', 'Configurações salvas.');
}

async function saveProfile(fd: FormData) {
  'use server';
  const { supabase, user } = await requireWorkspace();
  const name = str(fd, 'full_name');
  if (name.length < 2) flash('/configuracoes', 'err', 'Informe seu nome.');
  await supabase.from('profiles').update({ full_name: name }).eq('id', user.id);
  revalidatePath('/', 'layout');
  flash('/configuracoes', 'ok', 'Perfil atualizado.');
}

export default async function Configuracoes() {
  const { ws, profile, open } = await requireWorkspace('configuracoes');
  return (
    <>
      <PageHeader title="Configurações" subtitle="Seus dados aparecem automaticamente nas propostas e nos contratos." />
      <form action={save} className="mb-8">
        <fieldset disabled={!open} className="card grid gap-4 sm:grid-cols-2">
          <Field label="Nome do estúdio / marca *"><input name="name" required defaultValue={ws.name} className="input" /></Field>
          <Field label="Razão social ou seu nome completo" hint="Quem assina os contratos."><input name="legal_name" defaultValue={ws.legal_name ?? ''} className="input" /></Field>
          <Field label="CPF / CNPJ"><input name="document" defaultValue={ws.document ?? ''} className="input" /></Field>
          <Field label="E-mail comercial"><input name="email" type="email" defaultValue={ws.email ?? ''} className="input" /></Field>
          <Field label="Telefone / WhatsApp"><input name="phone" defaultValue={ws.phone ?? ''} className="input" /></Field>
          <Field label="Instagram"><input name="instagram" defaultValue={ws.instagram ?? ''} className="input" placeholder="@seuperfil" /></Field>
          <Field label="Endereço" className="sm:col-span-2"><input name="address" defaultValue={ws.address ?? ''} className="input" /></Field>
          <Field label="Cidade / UF" hint="Usada como foro dos contratos."><input name="city" defaultValue={ws.city ?? ''} className="input" /></Field>
          <Field label="Site"><input name="website" defaultValue={ws.website ?? ''} className="input" /></Field>
          <Field label="Logotipo (endereço https://)" hint="Hospede a imagem (PNG/SVG) e cole o link."><input name="logo_url" type="url" defaultValue={ws.logo_url ?? ''} className="input" /></Field>
          <Field label="Cor da marca nas propostas"><div className="flex gap-2"><input name="brand_color" type="color" defaultValue={ws.brand_color} className="h-11 w-16 rounded-xl border border-line bg-surface p-1" aria-label="Cor da marca" /><input readOnly value={ws.brand_color} className="input" aria-hidden /></div></Field>
          <Field label="Alíquota de imposto estimada (%)" hint="Usada no painel e na calculadora de metas. Ex.: 6 para Simples/MEI conforme seu enquadramento — confirme com seu contador."><input name="tax_rate_pct" inputMode="decimal" defaultValue={String(ws.tax_rate_pct).replace('.', ',')} className="input" /></Field>
          <div className="sm:col-span-2"><SubmitButton>Salvar configurações</SubmitButton></div>
        </fieldset>
      </form>
      <Section title="Seu perfil">
        <form action={saveProfile} className="flex flex-wrap items-end gap-3"><Field label="Nome"><input name="full_name" defaultValue={profile.full_name} className="input" /></Field><SubmitButton pendingText="…">Salvar</SubmitButton></form>
        <p className="mt-3 text-xs text-muted">E-mail de acesso: {profile.email}</p>
      </Section>
    </>
  );
}
