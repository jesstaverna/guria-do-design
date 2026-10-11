import Link from 'next/link';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { flash } from '@/lib/session';

async function request(fd: FormData) {
  'use server';
  const email = String(fd.get('email') ?? '').trim();
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL || `https://${h.get('host')}`;
  await (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha` });
  // Resposta igual exista ou não a conta (não revela cadastros).
  flash('/esqueci-senha', 'ok', 'Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.');
}

export const metadata = { title: 'Esqueci a senha' };

export default function Forgot() {
  return (
    <AuthShell title="Esqueci a senha" subtitle="Informe seu e-mail e enviaremos um link para criar uma nova senha.">
      <form action={request} className="space-y-5">
        <Field label="E-mail"><input name="email" type="email" required autoComplete="email" className="input" /></Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Enviando…">Enviar link</SubmitButton>
      </form>
      <p className="text-sm text-muted"><Link href="/login" className="font-medium text-fg underline">Voltar para o login</Link></p>
    </AuthShell>
  );
}
