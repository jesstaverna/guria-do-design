'use client';
import { useEffect, type RefObject } from 'react';

/** Navegação por arrasto: segure o botão do mouse num espaço vazio do quadro e arraste para os lados. Não interfere em cartões, links, campos nem no arrastar-e-soltar dos cartões. */
export function useDragScroll(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let startX = 0, startLeft = 0, active = false;
    const interactive = 'article, a, button, input, select, textarea, label, summary, [draggable="true"]';
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as HTMLElement).closest(interactive)) return;
      active = true; startX = e.clientX; startLeft = el.scrollLeft; el.setPointerCapture(e.pointerId); el.style.cursor = 'grabbing'; el.style.userSelect = 'none';
    };
    const move = (e: PointerEvent) => { if (active) el.scrollLeft = startLeft - (e.clientX - startX); };
    const up = (e: PointerEvent) => { if (!active) return; active = false; el.releasePointerCapture?.(e.pointerId); el.style.cursor = ''; el.style.userSelect = ''; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => { el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  }, [ref]);
}

/** Faz o quadro ocupar exatamente o resto da tela (as colunas rolam por dentro e a página não cresce). */
export function useFillViewport(ref: RefObject<HTMLElement | null>, bottomGap = 100, minHeight = 320) {
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const fit = () => { const top = el.getBoundingClientRect().top + window.scrollY; el.style.height = `${Math.max(minHeight, window.innerHeight - top - bottomGap)}px`; };
    fit(); window.addEventListener('resize', fit);
    const t = setTimeout(fit, 300);   // depois que fontes/filtros assentam
    return () => { window.removeEventListener('resize', fit); clearTimeout(t); };
  }, [ref, bottomGap, minHeight]);
}
