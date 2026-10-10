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
  if (error) flash(`/login?next=${encodeURIComponent(next)}`, 'err', 'E-mail ou senha inválidos.'); // genérico: não revela se o e-mail existe
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
      </form>
      <p className="text-sm text-muted">Ainda não tem conta? <Link href={`/cadastro?next=${encodeURIComponent(n)}`} className="font-medium text-fg underline">Criar conta</Link></p>
    </AuthShell>
  );
}
