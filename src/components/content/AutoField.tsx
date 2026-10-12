'use client';
import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/ClientButtons';

export type SaveFn = (patch: Record<string, unknown>) => Promise<{ ok: true; savedAt: string } | { error: string }>;
type Kind = 'text' | 'textarea' | 'select' | 'date' | 'datetime' | 'checkbox' | 'number';

const toLocalInput = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16).replace(' ', 'T') : '');

/** Campo com autosave seguro: texto salva 0,9 s após parar de digitar (e ao sair do campo); seleção/data/caixa salvam na hora. Mostra o estado. */
export function AutoField({ field, label, kind = 'text', initial, options, save, rows = 4, mono, disabled, hint, copy, placeholder, maxLength }: {
  field: string; label: string; kind?: Kind; initial: string | boolean | number | null | undefined; options?: { value: string; label: string }[]; save: SaveFn;
  rows?: number; mono?: boolean; disabled?: boolean; hint?: string; copy?: boolean; placeholder?: string; maxLength?: number;
}) {
  const start = kind === 'datetime' ? toLocalInput(initial as string) : kind === 'checkbox' ? Boolean(initial) : String(initial ?? '');
  const [value, setValue] = useState<string | boolean>(start);
  const [state, setState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<string | boolean>(start);
  const dirty = useRef(false);

  const serialize = (v: string | boolean): unknown => {
    if (kind === 'checkbox') return Boolean(v);
    if (kind === 'datetime') return v ? `${v}:00-03:00` : null;
    if (kind === 'date' || kind === 'select') return v === '' ? null : v;
    return v;
  };
  async function commit() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return;
    dirty.current = false; setState('saving');
    const r = await save({ [field]: serialize(latest.current) });
    if ('error' in r) { setErr(r.error); setState('error'); dirty.current = true; } else { setState('saved'); setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000); }
  }
  function change(v: string | boolean) {
    setValue(v); latest.current = v; dirty.current = true; setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, kind === 'text' || kind === 'textarea' || kind === 'number' ? 900 : 0);
  }
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (dirty.current) void save({ [field]: serialize(latest.current) }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const common = { id: `f-${field}`, disabled, onBlur: commit, 'aria-label': label };
  const status = state === 'saving' ? 'Salvando…' : state === 'pending' ? 'Editando…' : state === 'saved' ? 'Salvo ✓' : state === 'error' ? err : '';
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={`f-${field}`} className="label !mb-0">{label}</label>
        <span className="flex items-center gap-2">
          <span role="status" className={`text-[11px] ${state === 'error' ? 'text-danger' : 'text-muted'}`}>{status}</span>
          {copy && typeof value === 'string' && value && <CopyButton text={value} label="Copiar" />}
        </span>
      </div>
      {kind === 'textarea' ? <textarea {...common} rows={rows} value={value as string} maxLength={maxLength} placeholder={placeholder} onChange={(e) => change(e.target.value)} className={`input ${mono ? 'font-mono !text-[13px]' : ''}`} />
        : kind === 'select' ? <select {...common} value={value as string} onChange={(e) => change(e.target.value)} className="input">{options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        : kind === 'checkbox' ? <label className="flex items-center gap-2 text-sm"><input {...common} type="checkbox" checked={value as boolean} onChange={(e) => change(e.target.checked)} />{hint}</label>
        : <input {...common} type={kind === 'date' ? 'date' : kind === 'datetime' ? 'datetime-local' : kind === 'number' ? 'number' : 'text'} value={value as string} maxLength={maxLength} placeholder={placeholder} onChange={(e) => change(e.target.value)} className="input" />}
      {hint && kind !== 'checkbox' && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
