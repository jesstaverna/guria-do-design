'use client';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Faz o conteúdo ocupar toda a largura útil da tela, alinhado às bordas da barra superior (mesma margem lateral),
 * ignorando o limite de largura da página. Mede a área real (sem a barra de rolagem da página).
 */
export function FullBleed({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; const parent = el?.parentElement; const shell = el?.closest('.app-main') as HTMLElement | null; const main = el?.closest('main');
    if (!el || !parent || !shell || !main) return;
    const fit = () => {
      const cs = getComputedStyle(shell); const gutter = parseFloat(getComputedStyle(main).paddingLeft) || 0;
      const left = shell.getBoundingClientRect().left + (parseFloat(cs.paddingLeft) || 0);
      const width = shell.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      el.style.width = `${Math.max(320, width - 2 * gutter)}px`;
      const pcs = getComputedStyle(parent); el.style.marginLeft = `${left + gutter - (parent.getBoundingClientRect().left + (parseFloat(pcs.paddingLeft) || 0) + (parseFloat(pcs.borderLeftWidth) || 0))}px`;
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(shell); ro.observe(parent); window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, []);
  return <div ref={ref}>{children}</div>;
}
