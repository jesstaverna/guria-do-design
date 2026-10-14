import type { ReactNode } from 'react';

/** Faz o conteúdo ocupar toda a largura útil da tela (menos o menu lateral), ignorando o limite de largura da página. */
export function FullBleed({ children }: { children: ReactNode }) {
  return <div style={{ width: 'calc(100vw - var(--sidebar-w) - 2rem)', marginLeft: 'calc((100% - (100vw - var(--sidebar-w) - 2rem)) / 2)' }}>{children}</div>;
}
