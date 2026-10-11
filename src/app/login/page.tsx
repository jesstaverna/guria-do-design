import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { flash, safeNext } from '@/lib/session';

async function signIn(formData: FormData) {
  'use server';
  const next = safeNext(String(formData.get('next') ?? ''));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: String(formData.get('email') ?? '').trim(), password: String(formData.get('password') ?? '') });
  if (error) {
    const back = `/login?next=${encodeURIComponent(next)}`;
    // Credenciais erradas: mensagem genérica (não revela se o e-mail existe). Demais falhas mostram o motivo técnico.
    if (error.code === 'invalid_credentials') flash(back, 'err', 'E-mail ou senha inválidos.');
    if (error.code === 'email_not_confirmed') flash(back, 'err', 'E-mail ainda não confirmado. Confirme pelo link enviado ou peça ao suporte.');
    flash(back, 'err', `Não foi possível entrar (${error.code ?? error.status ?? 'erro'}: ${error.message}).`);
  }
  redirect(next);
}

export const metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const n = safeNext(next);
  return (
    <AuthShell title="Entrar" subtitle="Acesse o seu estúdio.">
      <form action={signIn} className="space-y-5">
        <input type="hidden" name="next" value={n} />
        <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <Field label="Senha"><input name="password" type="password" required autoComplete="current-password" className="input" /></Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Entrando…">Entrar</SubmitButton>
        <p className="text-right text-sm"><Link href="/esqueci-senha" className="text-muted underline">Esqueci minha senha</Link></p>
      </form>
      <p className="text-sm text-muted">Ainda não tem conta? <Link href={`/cadastro?next=${encodeURIComponent(n)}`} className="font-medium text-fg underline">Criar conta</Link></p>
    </AuthShell>
  );
}
