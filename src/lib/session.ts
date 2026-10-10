import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccess, isAdminRole, type ModuleKey } from '@/lib/permissions';

export const WS_COOKIE = 'guria-ws';

export interface Workspace {
  id: string; name: string; slug: string; plan: string; status: 'trial' | 'active' | 'past_due' | 'canceled'; trial_ends_at: string;
  legal_name: string | null; document: string | null; email: string | null; phone: string | null; address: string | null; city: string | null;
  website: string | null; instagram: string | null; logo_url: string | null; brand_color: string; tax_rate_pct: number;
}
export interface Membership { role: 'owner' | 'admin' | 'member'; workspace: Workspace }

const WS_COLS = 'id, name, slug, plan, status, trial_ends_at, legal_name, document, email, phone, address, city, website, instagram, logo_url, brand_color, tax_rate_pct';

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email').eq('id', data.user.id).single(),
    supabase.from('workspace_members').select(`role, workspace:workspaces(${WS_COLS})`).eq('user_id', data.user.id).eq('active', true),
  ]);
  const memberships = ((rows ?? []) as unknown as Membership[]).filter((m) => m.workspace);
  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  const current = memberships.find((m) => m.workspace.id === wanted) ?? memberships[0] ?? null;
  return { user: data.user, profile: profile as { id: string; full_name: string; email: string | null } | null, memberships, current };
});

export function flash(path: string, kind: 'ok' | 'err', message: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

/** Assinatura ativa ou teste em andamento = pode escrever. Espelha app.ws_open (o banco é a autoridade). */
export const isOpen = (w: Pick<Workspace, 'status' | 'trial_ends_at'>) => w.status === 'active' || (w.status === 'trial' && new Date(w.trial_ends_at) > new Date());
export const trialDaysLeft = (w: Pick<Workspace, 'trial_ends_at'>) => Math.ceil((new Date(w.trial_ends_at).getTime() - Date.now()) / 86_400_000);

/** Exige login + workspace (+ módulo). Use no topo de cada página/ação. */
export async function requireWorkspace(module?: ModuleKey) {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!s.current) redirect('/onboarding');
  const { role, workspace: ws } = s.current;
  if (module && !canAccess(role, module)) flash('/dashboard', 'err', 'Seu perfil não tem acesso a este módulo.');
  return { supabase: await createClient(), user: s.user, profile: s.profile!, ws, role, isAdmin: isAdminRole(role), open: isOpen(ws), memberships: s.memberships };
}

/** Para Server Actions: bloqueia escrita com mensagem amigável quando o plano não está ativo. */
export async function requireWritable(module?: ModuleKey) {
  const ctx = await requireWorkspace(module);
  if (!ctx.open) flash('/plano', 'err', 'Seu período de teste/assinatura terminou: o sistema está em modo somente leitura.');
  return ctx;
}

/** Traduz erros do Postgres em mensagens úteis. */
export function dbMessage(error: { code?: string; message?: string } | null | undefined, fallback = 'Não foi possível salvar.') {
  switch (error?.code) {
    case '23505': return 'Já existe um registro com estes dados.';
    case '42501': return 'Sem permissão para esta operação (ou assinatura inativa).';
    case '53400': return error?.message?.replace(/^.*?Limite/, 'Limite') ?? 'Limite do plano atingido.';
    case '23514': return error?.message && !error.message.includes('violates check constraint') ? error.message : 'Dados inválidos.';
    case '23503': return 'O registro relacionado não existe neste espaço.';
    case '22023': return error?.message ?? fallback;
    default: return fallback;
  }
}

export function safeNext(next: string | null | undefined, fallback = '/dashboard') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : fallback;
}
