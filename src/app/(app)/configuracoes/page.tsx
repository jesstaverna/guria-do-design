import { requireWorkspace } from '@/lib/session';
import { Field, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { Avatar } from '@/components/Avatar';
import { BrandColorField } from '@/components/BrandColorField';
import { removeAvatar, removeLogo, saveProfile, saveWorkspace, uploadAvatar, uploadLogo } from './actions';

export const metadata = { title: 'Configurações' };

const ACCEPT = 'image/png,image/jpeg,image/webp';

export default async function Configuracoes() {
  const { ws, profile, open } = await requireWorkspace('configuracoes');
  return (
    <>
      <PageHeader title="Configurações" subtitle="Seus dados aparecem automaticamente nas propostas e nos contratos." />
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <Section title="Logotipo do estúdio">
          <div className="flex items-center gap-5">
            <div className="grid h-20 w-36 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-white p-2">
              {ws.logo_url /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={ws.logo_url} alt={`Logotipo de ${ws.name}`} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-black/40">sem logotipo</span>}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <form action={uploadLogo} className="space-y-2">
                <input name="file" type="file" accept={ACCEPT} required disabled={!open} className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs" aria-label="Escolher logotipo" />
                <SubmitButton className="btn btn-sm" pendingText="Enviando…">Enviar logotipo</SubmitButton>
              </form>
              {ws.logo_url && open && <form action={removeLogo}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover o logotipo?">Remover</SubmitButton></form>}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">PNG, JPG ou WebP, até 2 MB. Fundo transparente (PNG) fica melhor. Aparece nas propostas, contratos e no menu.</p>
        </Section>
        <Section title="Sua foto (avatar)">
          <div className="flex items-center gap-5">
            <Avatar url={profile.avatar_url} name={profile.full_name || profile.email || 'Você'} size={80} />
            <div className="min-w-0 flex-1 space-y-3">
              <form action={uploadAvatar} className="space-y-2">
                <input name="file" type="file" accept={ACCEPT} required className="block w-full text-xs file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs" aria-label="Escolher foto" />
                <SubmitButton className="btn btn-sm" pendingText="Enviando…">Enviar foto</SubmitButton>
              </form>
              {profile.avatar_url && <form action={removeAvatar}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover a foto?">Remover</SubmitButton></form>}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Aparece no menu e na lista da equipe. Pessoas da equipe também podem enviar a própria foto.</p>
        </Section>
      </div>
      <form action={saveWorkspace} className="mb-8">
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
          <Field label="Cor da marca" className="sm:col-span-2" hint="Aplicada no sistema inteiro (menu, botões, gráficos) e nas propostas e contratos."><BrandColorField defaultValue={ws.brand_color} /></Field>
          <Field label="Alíquota de imposto estimada (%)" hint="Usada no painel e na calculadora de metas. Confirme com seu contador."><input name="tax_rate_pct" inputMode="decimal" defaultValue={String(ws.tax_rate_pct).replace('.', ',')} className="input" /></Field>
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
