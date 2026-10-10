import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase/anon';
import { createClient } from '@/lib/supabase/server';
import { AuthShell } from '@/components/AuthShell';
import { SubmitButton } from '@/components/SubmitButton';
import { dbMessage, flash, getSession, WS_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Convite', robots: { index: false, follow: false } };

async function accept(token: string) {
  'use server';
  if (!/^[a-f0-9]{64}$/.test(token)) redirect('/');
  const { data, error } = await (await createClient()).rpc('accept_invite', { p_token: token });
  if (error) flash(`/convite/${token}`, 'err', error.code === '42501' && /outro e-mail/.test(error.message) ? 'Este convite foi enviado para outro e-mail. Entre com o e-mail convidado.' : dbMessage(error, 'Convite inválido ou expirado.'));
  (await cookies()).set(WS_COOKIE, data as string, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31_536_000 });
  flash('/dashboard', 'ok', 'Bem-vindo(a) ao time!');
}

export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[a-f0-9]{64}$/.test(token);
  const { data: info } = valid ? await createAnonClient().rpc('invite_public_info', { p_token: token }) : { data: null };
  const s = await getSession();
  const next = `/convite/${token}`;
  if (!info) return <AuthShell title="Convite inválido" subtitle="O link expirou, já foi usado ou está incorreto. Peça um novo convite."><Link href="/login" className="btn w-full">Ir para o login</Link></AuthShell>;
  return (
    <AuthShell title={`Entrar em ${info.workspace}`} subtitle={`Convite para ${info.email} como ${info.role === 'admin' ? 'administrador' : 'membro da equipe'}.`}>
      {s ? (
        <form action={accept.bind(null, token)}><SubmitButton className="btn btn-primary w-full" pendingText="Entrando…">Aceitar convite</SubmitButton></form>
      ) : (
        <div className="space-y-3">
          <Link href={`/cadastro?next=${encodeURIComponent(next)}`} className="btn btn-primary w-full">Criar conta e aceitar</Link>
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn w-full">Já tenho conta</Link>
          <p className="text-xs text-muted">Use o e-mail {info.email} — o convite só vale para ele.</p>
        </div>
      )}
    </AuthShell>
  );
}
