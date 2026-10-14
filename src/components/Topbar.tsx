'use client';
import Link from 'next/link';
import { Bell, ChevronDown, CreditCard, LogOut, Search, Settings } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SidebarToggle } from '@/components/SidebarToggle';

/** Barra superior (desktop): busca, alertas, tema e menu da pessoa com foto, nome e estúdio. */
export function Topbar({ userName, wsName, avatarUrl, unread, isAdmin, signOut }: { userName: string; wsName: string; avatarUrl: string | null; unread: number; isAdmin: boolean; signOut: () => void | Promise<void> }) {
  return (
    <div className="flex items-center gap-3 px-6 pt-5 max-lg:hidden lg:px-10">
      <SidebarToggle />
      <form action="/clientes" className="relative max-w-xl flex-1" role="search">
        <label htmlFor="topbar-q" className="sr-only">Buscar clientes</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.6} />
        <input id="topbar-q" name="q" placeholder="Buscar clientes por nome ou empresa…" className="input !rounded-xl !pl-10" />
      </form>
      <div className="ml-auto flex items-center gap-2">
        <Link href="/alertas" className="btn btn-sm relative" aria-label={`Alertas${unread ? `: ${unread} não lidos` : ''}`}>
          <Bell className="h-4 w-4" strokeWidth={1.6} />
          {!!unread && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent">{unread > 99 ? '99+' : unread}</span>}
        </Link>
        <ThemeToggle />
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-xl border border-line bg-surface py-1.5 pl-1.5 pr-3 transition hover:bg-subtle [&::-webkit-details-marker]:hidden">
            <Avatar url={avatarUrl} name={userName} size={32} />
            <span className="text-left leading-tight"><span className="block max-w-36 truncate text-sm font-medium">{userName}</span><span className="block max-w-36 truncate text-[11px] text-muted">{wsName}</span></span>
            <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" strokeWidth={1.6} />
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
            <Link href="/configuracoes" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-subtle"><Settings className="h-4 w-4" strokeWidth={1.6} />Configurações e perfil</Link>
            {isAdmin && <Link href="/plano" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-subtle"><CreditCard className="h-4 w-4" strokeWidth={1.6} />Plano e cobrança</Link>}
            <form action={signOut}><button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-subtle"><LogOut className="h-4 w-4" strokeWidth={1.6} />Sair</button></form>
          </div>
        </details>
      </div>
    </div>
  );
}
