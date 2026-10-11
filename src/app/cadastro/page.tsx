import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { flash, safeNext } from '@/lib/session';

async function signUp(formData: FormData) {
  'use server';
  const next = safeNext(String(formData.get('next') ?? ''), '/onboarding');
  const back = `/cadastro?next=${encodeURIComponent(next)}`;
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (name.length < 2) flash(back, 'err', 'Informe seu nome.');
  if (password.length < 8) flash(back, 'err', 'A senha precisa ter ao menos 8 caracteres.');
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get('email') ?? '').trim(), password,
    options: { data: { full_name: name }, emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    const known: Record<string, string> = {
      email_exists: 'Este e-mail já tem conta. Tente entrar.', user_already_exists: 'Este e-mail já tem conta. Tente entrar.',
      weak_password: 'Senha fraca. Use 8+ caracteres misturando letras e números.', over_email_send_rate_limit: 'Limite de e-mails do Supabase atingido. Aguarde cerca de 1 hora ou configure um SMTP próprio.',
      email_address_invalid: 'E-mail inválido.', signup_disabled: 'Cadastro desativado no Supabase (Authentication → Sign In / Providers).',
    };
    flash(back, 'err', known[error.code ?? ''] ?? `Não foi possível criar a conta (${error.code ?? error.status ?? 'erro'}: ${error.message}).`);
  }
  // Com confirmação de e-mail ativa no Supabase, não há sessão até o clique no link.
  if (!data.session) flash('/login', 'ok', 'Conta criada! Confirme seu e-mail para entrar.');
  redirect(next);
}

export const metadata = { title: 'Criar conta' };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const n = safeNext(next, '/onboarding');
  return (
    <AuthShell title="Criar conta" subtitle="14 dias de teste com tudo liberado. Sem cartão.">
      <form action={signUp} className="space-y-5">
        <input type="hidden" name="next" value={n} />
        <Field label="Seu nome"><input name="name" required autoComplete="name" className="input" /></Field>
        <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres."><input name="password" type="password" required minLength={8} autoComplete="new-password" className="input" /></Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Criando…">Criar conta</SubmitButton>
      </form>
      <p className="text-sm text-muted">Já tem conta? <Link href={`/login?next=${encodeURIComponent(n)}`} className="font-medium text-fg underline">Entrar</Link></p>
    </AuthShell>
  );
}
