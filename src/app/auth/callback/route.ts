import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/session';

/** Retorno dos links de e-mail do Supabase (confirmação de cadastro e redefinição de senha, fluxo PKCE). */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'), '/dashboard');
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?err=${encodeURIComponent('Link inválido ou expirado. Peça um novo ou entre com sua senha.')}`);
}
