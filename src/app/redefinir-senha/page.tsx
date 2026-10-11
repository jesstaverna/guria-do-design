import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { flash } from '@/lib/session';

async function save(fd: FormData) {
  'use server';
  const password = String(fd.get('password') ?? '');
  if (password.length < 8) flash('/redefinir-senha', 'err', 'A senha precisa ter ao menos 8 caracteres.');
  if (password !== String(fd.get('confirm') ?? '')) flash('/redefinir-senha', 'err', 'As senhas não conferem.');
  const { error } = await (await createClient()).auth.updateUser({ password });
  if (error) flash('/redefinir-senha', 'err', 'Não foi possível salvar a nova senha. Peça um novo link.');
  flash('/dashboard', 'ok', 'Senha atualizada.');
}

export const metadata = { title: 'Nova senha' };

export default async function Reset() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) redirect('/login?err=' + encodeURIComponent('Abra o link do e-mail para redefinir a senha.'));
  return (
    <AuthShell title="Nova senha" subtitle="Escolha uma senha com pelo menos 8 caracteres.">
      <form action={save} className="space-y-5">
        <Field label="Nova senha"><input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <Field label="Repita a senha"><input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Salvando…">Salvar nova senha</SubmitButton>
      </form>
    </AuthShell>
  );
}
