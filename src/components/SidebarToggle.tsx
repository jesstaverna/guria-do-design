'use client';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

const KEY = 'orbiahub-sidebar';

/** Recolhe/abre o menu lateral (só no computador). A escolha fica salva neste navegador. */
export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(document.documentElement.dataset.sidebar === 'collapsed'), []);
  function toggle() {
    const next = !collapsed;
    if (next) document.documentElement.dataset.sidebar = 'collapsed'; else delete document.documentElement.dataset.sidebar;
    try { localStorage.setItem(KEY, next ? 'collapsed' : 'open'); } catch { /* armazenamento indisponível */ }
    setCollapsed(next);
  }
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return <button type="button" onClick={toggle} className="btn btn-sm max-lg:hidden" aria-label={collapsed ? 'Mostrar o menu lateral' : 'Recolher o menu lateral'} title={collapsed ? 'Mostrar o menu' : 'Recolher o menu (mais espaço)'}><Icon className="h-4 w-4" strokeWidth={1.6} /></button>;
}
