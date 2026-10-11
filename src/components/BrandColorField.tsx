'use client';
import { useState } from 'react';
import { brandVars } from '@/lib/brand-color';

const PRESETS = ['#dd00dd', '#7327ea', '#2563eb', '#0d9488', '#16a34a', '#f59e0b', '#ef4444', '#111111'];

/** Seletor da cor da marca com prévia ao vivo (botão, etiqueta e barra) usando as mesmas variáveis do tema. */
export function BrandColorField({ defaultValue }: { defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input name="brand_color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-20 rounded-xl border border-line bg-surface p-1" aria-label="Cor da marca" />
        {PRESETS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Usar ${c}`} className={`h-7 w-7 rounded-full border-2 ${color.toLowerCase() === c ? 'border-fg' : 'border-transparent'}`} style={{ background: c }} />)}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3" style={brandVars(color) as React.CSSProperties} aria-label="Prévia da marca">
        <span className="btn btn-primary btn-sm pointer-events-none">Botão principal</span>
        <span className="badge border-transparent bg-accent/15 text-accent-ink">Etiqueta</span>
        <span className="h-2.5 w-28 overflow-hidden rounded-full bg-subtle"><span className="block h-full w-2/3 rounded-full bg-accent" /></span>
        <span className="rounded-xl bg-accent px-3 py-1.5 text-xs font-medium text-on-accent">Item do menu</span>
      </div>
    </div>
  );
}
