'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Aparece suavemente ao entrar na tela (respeita "reduzir movimento"). */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={`transition duration-700 ease-out motion-reduce:transition-none ${on ? 'translate-y-0 opacity-100' : 'translate-y-5 opacity-0'} ${className}`}>{children}</div>;
}
