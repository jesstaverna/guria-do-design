'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FullBleed } from '@/components/kanban/FullBleed';

const TABS = [
  { href: '/conteudo', label: 'Visão geral', exact: true }, { href: '/conteudo/calendario', label: 'Calendário' }, { href: '/conteudo/kanban', label: 'Kanban' },
  { href: '/conteudo/pilares', label: 'Pilares' }, { href: '/conteudo/acervo', label: 'Acervo' }, { href: '/conteudo/importar', label: 'Importar', admin: true },
];

const Plain = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export function ContentTabs({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const Wrap = path.startsWith('/conteudo/kanban') ? FullBleed : Plain;
  return (
    <Wrap><nav aria-label="Planejamento de conteúdo" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.filter((t) => !t.admin || isAdmin).map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(t.href + '/');
        return <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={`whitespace-nowrap px-4 py-2.5 text-sm ${active ? 'border-b-2 border-accent font-medium' : 'text-muted hover:text-fg'}`}>{t.label}</Link>;
      })}
    </nav></Wrap>
  );
}
