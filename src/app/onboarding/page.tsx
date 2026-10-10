import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { dbMessage, flash, getSession, WS_COOKIE } from '@/lib/session';

async function createWorkspace(fd: FormData) {
  'use server';
  const s = await getSession();
  if (!s) redirect('/login');
  const name = String(fd.get('name') ?? '').trim();
  if (name.length < 2) flash('/onboarding', 'err', 'Dê um nome ao seu estúdio.');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_workspace', { p_name: name });
  if (error) flash('/onboarding', 'err', dbMessage(error, 'Não foi possível criar o espaço.'));
  (await cookies()).set(WS_COOKIE, data as string, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31_536_000 });
  flash('/configuracoes', 'ok', 'Estúdio criado! Complete seus dados: eles aparecem nas propostas e contratos.');
}

export const metadata = { title: 'Seu estúdio' };

export default async function Onboarding() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (s.current) redirect('/dashboard');
  return (
    <AuthShell title="Vamos começar" subtitle="Como se chama o seu estúdio ou nome profissional?">
      <form action={createWorkspace} className="space-y-5">
        <Field label="Nome do estúdio" hint="Aparece nas propostas e contratos. Você pode mudar depois."><input name="name" required minLength={2} maxLength={120} className="input" placeholder="Ex.: Guria do Design" /></Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Criando…">Criar meu estúdio</SubmitButton>
      </form>
    </AuthShell>
  );
}
