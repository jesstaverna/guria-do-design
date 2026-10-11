'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Icon } from './Icon';
import { APP_NAME } from '@/lib/brand';
import { Avatar } from './Avatar';

export interface NavItem { key: string; label: string; href: string; icon: string; group: string }
export interface WsOption { id: string; name: string }

export function Sidebar({ items, userName, roleLabel, wsName, logoUrl, avatarUrl, workspaces, currentWs, signOut, switchWs }: {
  items: NavItem[]; userName: string; roleLabel: string; wsName: string; logoUrl: string | null; avatarUrl: string | null; workspaces: WsOption[]; currentWs: string;
  signOut: () => Promise<void>; switchWs: (fd: FormData) => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = [...new Set(items.map((i) => i.group))];

  const nav = (
    <nav aria-label="Menu principal" className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
      {groups.map((g) => (
        <div key={g}>
          <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">{g}</div>
          <div className="space-y-0.5">
            {items.filter((i) => i.group === g).map((m) => {
              const active = pathname === m.href || pathname.startsWith(m.href + '/');
              return (
                <Link key={m.key} href={m.href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active ? 'bg-accent font-medium text-on-accent' : 'text-fg/80 hover:bg-subtle'}`}>
                  <Icon name={m.icon} /><span className="flex-1">{m.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-6 pb-4 pt-6">
      {logoUrl /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={logoUrl} alt={wsName} className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-0.5" />
        : <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-on-accent">G</span>}
      <div className="min-w-0 leading-tight"><div className="truncate text-sm font-semibold tracking-wide">{wsName}</div><div className="truncate text-[11px] text-muted">{APP_NAME}</div></div>
    </div>
  );

  const footer = (
    <div className="space-y-3 border-t border-line p-4">
      {workspaces.length > 1 && (
        <form action={switchWs}>
          <label className="sr-only" htmlFor="ws-switch">Trocar de espaço</label>
          <select id="ws-switch" name="id" defaultValue={currentWs} className="input !py-1.5 text-xs" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
            {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </form>
      )}
      <div className="flex items-center gap-3"><Avatar url={avatarUrl} name={userName} size={36} /><div className="min-w-0"><div className="truncate text-sm font-medium">{userName}</div><div className="text-xs text-muted">{roleLabel}</div></div></div>
      <form action={signOut}><button className="btn btn-sm w-full">Sair</button></form>
    </div>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <span className="text-sm font-semibold tracking-wide">{APP_NAME}</span>
        <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="btn btn-sm"><Menu className="h-4 w-4" /></button>
      </div>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface lg:flex">{brand}{nav}{footer}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface">
            <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="btn btn-sm absolute right-3 top-3"><X className="h-4 w-4" /></button>
            {brand}{nav}{footer}
          </aside>
        </div>
      )}
    </>
  );
}
