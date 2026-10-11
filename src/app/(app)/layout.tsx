import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireWorkspace, trialDaysLeft, WS_COOKIE } from '@/lib/session';
import { MODULES, ROLE_LABEL } from '@/lib/permissions';
import { brandVars } from '@/lib/brand-color';
import { Sidebar } from '@/components/Sidebar';
import { Flash } from '@/components/Flash';
import { ThemeToggle } from '@/components/ThemeToggle';

async function signOut() {
  'use server';
  await (await createClient()).auth.signOut();
  (await cookies()).delete(WS_COOKIE);
  redirect('/login');
}

async function switchWs(fd: FormData) {
  'use server';
  const id = String(fd.get('id') ?? '');
  const { memberships } = await requireWorkspace();
  if (memberships.some((m) => m.workspace.id === id)) (await cookies()).set(WS_COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 31_536_000 });
  redirect('/dashboard');
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile, ws, role, isAdmin, open, memberships } = await requireWorkspace();
  // Administrador da plataforma (você, que vende o sistema): consulta pontual com a service role, só no servidor.
  let isMaster = false;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await createAdminClient().from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
    isMaster = !!data;
  }
  const items = MODULES.filter((m) => (m.key === 'plataforma' ? isMaster : !m.adminOnly || isAdmin)).map(({ key, label, href, icon, group }) => ({ key, label, href, icon, group }));
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).is('read_at', null);
  const days = trialDaysLeft(ws);

  return (
    <div className="min-h-screen" style={brandVars(ws.brand_color) as React.CSSProperties}>
      <Suspense><Flash /></Suspense>
      <Sidebar items={items} userName={profile.full_name || profile.email || 'Usuário'} roleLabel={ROLE_LABEL[role]} wsName={ws.name} logoUrl={ws.logo_url} avatarUrl={profile.avatar_url}
        workspaces={memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name }))} currentWs={ws.id} signOut={signOut} switchWs={switchWs} />
      <div className="lg:pl-64">
        {!open ? (
          <div className="bg-danger px-4 py-2.5 text-center text-sm text-white">Seu período de teste/assinatura terminou — o espaço está em <b>modo somente leitura</b>. {isAdmin && <Link href="/plano" className="underline">Ver plano</Link>}</div>
        ) : ws.status === 'trial' && (
          <div className="bg-violet-brand px-4 py-2 text-center text-sm text-white">Teste grátis: {days > 0 ? `${days} dia${days > 1 ? 's' : ''} restante${days > 1 ? 's' : ''}` : 'último dia'}. {isAdmin && <Link href="/plano" className="font-medium underline">Escolher plano</Link>}</div>
        )}
        <div className="flex items-center justify-end gap-2 px-6 pt-5 max-lg:hidden lg:px-10">
          <Link href="/alertas" className="btn btn-sm relative" aria-label={`Alertas${count ? `: ${count} não lidos` : ''}`}>
            <Bell className="h-4 w-4" strokeWidth={1.6} />
            {!!count && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{count > 99 ? '99+' : count}</span>}
          </Link>
          <ThemeToggle />
        </div>
        <main className="mx-auto max-w-[1400px] px-4 pb-20 pt-20 sm:px-6 lg:px-10 lg:pt-6">
          <div className="mb-4 flex justify-end gap-2 lg:hidden"><Link href="/alertas" className="btn btn-sm">Alertas{count ? ` (${count})` : ''}</Link><ThemeToggle /></div>
          {children}
        </main>
      </div>
    </div>
  );
}
