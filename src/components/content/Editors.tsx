'use client';
import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/ClientButtons';
import { allCardsText, cardText, manychatText, CARD_ROLE, type Card, type ChecklistItem, type ManyChat } from '@/lib/content';
import type { SaveFn } from './AutoField';

/** Hook de autosave para estruturas inteiras (cards, ManyChat, checklist...): salva 1 s depois da última alteração. */
function useAutosave<T>(field: string, save: SaveFn, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [state, setState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<T>(initial);
  const dirty = useRef(false);
  async function flush() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return;
    dirty.current = false; setState('saving');
    const r = await save({ [field]: latest.current });
    if ('error' in r) { setErr(r.error); setState('error'); dirty.current = true; } else { setState('saved'); setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2000); }
  }
  function update(next: T, immediate = false) {
    setValue(next); latest.current = next; dirty.current = true; setState('pending');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, immediate ? 0 : 1000);
  }
  useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); if (dirty.current) void save({ [field]: latest.current }); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = state === 'saving' ? 'Salvando…' : state === 'pending' ? 'Editando…' : state === 'saved' ? 'Salvo ✓' : state === 'error' ? err : '';
  return { value, update, flush, status, error: state === 'error' };
}
const Status = ({ text, error }: { text: string; error: boolean }) => <span role="status" className={`text-xs ${error ? 'text-danger' : 'text-muted'}`}>{text}</span>;

// ---------- 7 cards ----------
export function CardsEditor({ initial, save, disabled }: { initial: Card[]; save: SaveFn; disabled?: boolean }) {
  const { value: cards, update, flush, status, error } = useAutosave<Card[]>('cards', save, initial);
  const set = (i: number, patch: Partial<Card>) => update(cards.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  if (!cards.length) {
    return (
      <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
        Este conteúdo ainda não tem cards.
        {!disabled && <div className="mt-3"><button type="button" className="btn btn-sm" onClick={() => update(Array.from({ length: 7 }, (_, i) => ({ position: i + 1, role: i === 0 ? 'capa' : i === 6 ? 'fechamento' : 'desenvolvimento', headline: '', body: '', cta: i === 0 ? 'Arraste para ver →' : null, visual_direction: '' })), true)}>Criar os 7 cards</button></div>}
      </div>
    );
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><Status text={status} error={error} /><CopyButton text={allCardsText(cards)} label="Copiar todos os cards" /></div>
      <div className="grid gap-4 lg:grid-cols-2">
        {cards.map((c, i) => (
          <fieldset key={i} disabled={disabled} className="rounded-2xl border border-line bg-surface p-4" onBlur={flush}>
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-muted">Card {c.position}{c.role ? ` · ${CARD_ROLE[c.role] ?? c.role}` : ''}</legend>
            <div className="space-y-2.5">
              <input aria-label={`Título do card ${c.position}`} value={c.headline ?? ''} onChange={(e) => set(i, { headline: e.target.value })} placeholder="Título (headline)" className="input font-medium" />
              <textarea aria-label={`Texto do card ${c.position}`} rows={3} value={c.body ?? ''} onChange={(e) => set(i, { body: e.target.value })} placeholder="Texto" className="input" />
              <input aria-label={`CTA do card ${c.position}`} value={c.cta ?? ''} onChange={(e) => set(i, { cta: e.target.value })} placeholder={i === 0 ? 'CTA de arraste (obrigatório na capa)' : i === 6 ? 'CTA de interação / ManyChat' : 'CTA (opcional)'} className="input" />
              <textarea aria-label={`Direção visual do card ${c.position}`} rows={2} value={c.visual_direction ?? ''} onChange={(e) => set(i, { visual_direction: e.target.value })} placeholder="Orientação visual" className="input !text-xs" />
              <div className="flex items-center justify-between">{(i === 0 && !c.cta?.trim()) || (i === 6 && !c.cta?.trim()) ? <span className="text-xs text-warn">{i === 0 ? 'A capa deve ter CTA de arraste.' : 'O card 7 deve ter CTA.'}</span> : <span />}<CopyButton text={cardText(c)} label="Copiar card" /></div>
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

// ---------- ManyChat (rascunho; nunca ativo) ----------
export function ManyChatEditor({ initial, save, disabled }: { initial: ManyChat | null; save: SaveFn; disabled?: boolean }) {
  const base: ManyChat = initial ?? { name: '', trigger_keyword: '', status: 'rascunho', enabled: false, public_comment_replies: ['', '', ''], dm_messages: ['', '', ''], notes: '' };
  const { value: m, update, flush, status, error } = useAutosave<ManyChat>('manychat', save, base);
  const setIdx = (key: 'public_comment_replies' | 'dm_messages', i: number, v: string) => update({ ...m, [key]: (m[key] ?? ['', '', '']).map((x, k) => (k === i ? v : x)) });
  return (
    <fieldset disabled={disabled} onBlur={flush} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="badge border-transparent bg-warn/15 text-warn">Rascunho · desativado</span><span className="text-muted">Nenhuma automação é criada ou disparada pelo Guria OS. Copie e configure no ManyChat você mesma.</span></div>
        <div className="flex items-center gap-2"><Status text={status} error={error} /><CopyButton text={manychatText(m)} label="Copiar tudo" /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="label">Nome do fluxo</span><input value={m.name ?? ''} onChange={(e) => update({ ...m, name: e.target.value })} className="input" /></label>
        <label className="block"><span className="label">Palavra-chave do comentário</span><input value={m.trigger_keyword ?? ''} onChange={(e) => update({ ...m, trigger_keyword: e.target.value.toUpperCase() })} className="input font-mono" /></label>
      </div>
      <div>
        <div className="label">3 variações de resposta pública <span className="font-normal normal-case text-muted">(alternativas — use UMA por pessoa)</span></div>
        <div className="space-y-2">{[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2"><textarea aria-label={`Resposta pública ${i + 1}`} rows={2} value={m.public_comment_replies?.[i] ?? ''} onChange={(e) => setIdx('public_comment_replies', i, e.target.value)} className="input" /><div className="shrink-0 pt-1"><CopyButton text={m.public_comment_replies?.[i] ?? ''} label="Copiar" /></div></div>))}</div>
      </div>
      <div>
        <div className="label">3 mensagens de direct <span className="font-normal normal-case text-muted">(enviadas em sequência)</span></div>
        <div className="space-y-2">{[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2"><textarea aria-label={`Mensagem de direct ${i + 1}`} rows={4} value={m.dm_messages?.[i] ?? ''} onChange={(e) => setIdx('dm_messages', i, e.target.value)} className="input" /><div className="shrink-0 pt-1"><CopyButton text={m.dm_messages?.[i] ?? ''} label="Copiar" /></div></div>))}</div>
      </div>
      <label className="block"><span className="label">Observações</span><textarea rows={2} value={m.notes ?? ''} onChange={(e) => update({ ...m, notes: e.target.value })} className="input" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.status === 'revisado'} onChange={(e) => update({ ...m, status: e.target.checked ? 'revisado' : 'rascunho' }, true)} />Textos revisados por mim (continua desativado)</label>
    </fieldset>
  );
}

// ---------- Reels e Stories ----------
interface Beat { seconds?: string; headline?: string; direction?: string }
interface ReelsData { duration_seconds?: number; dimensions?: string; beats?: Beat[] }
interface Frame { number?: number; title?: string; body?: string }
interface StoriesData { dimensions?: string; frames?: Frame[] }

export function ReelsEditor({ initial, save, disabled }: { initial: ReelsData | null; save: SaveFn; disabled?: boolean }) {
  const { value: r, update, flush, status, error } = useAutosave<ReelsData | null>('reels', save, initial);
  if (!r) return <p className="text-sm text-muted">Sem roteiro de Reels.</p>;
  const beats = r.beats ?? [];
  const setBeat = (i: number, p: Partial<Beat>) => update({ ...r, beats: beats.map((b, k) => (k === i ? { ...b, ...p } : b)) });
  const text = [`REELS · ${r.duration_seconds ?? '?'} s · ${r.dimensions ?? '1080x1920'}`, ...beats.map((b) => `${b.seconds}  ${b.headline}\n   ${b.direction}`)].join('\n');
  return (
    <fieldset disabled={disabled} onBlur={flush} className="space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm text-muted">Duração: {r.duration_seconds ?? '—'} s · {r.dimensions ?? '1080x1920'}</span><span className="flex items-center gap-2"><Status text={status} error={error} /><CopyButton text={text} label="Copiar roteiro" /></span></div>
      {beats.map((b, i) => (
        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[6rem_1fr]">
          <input aria-label={`Tempo da cena ${i + 1}`} value={b.seconds ?? ''} onChange={(e) => setBeat(i, { seconds: e.target.value })} className="input font-mono" />
          <div className="space-y-2"><input aria-label={`Gancho/título da cena ${i + 1}`} value={b.headline ?? ''} onChange={(e) => setBeat(i, { headline: e.target.value })} className="input font-medium" /><textarea aria-label={`Direção da cena ${i + 1}`} rows={2} value={b.direction ?? ''} onChange={(e) => setBeat(i, { direction: e.target.value })} className="input !text-xs" /></div>
        </div>))}
    </fieldset>
  );
}

export function StoriesEditor({ initial, save, disabled }: { initial: StoriesData | null; save: SaveFn; disabled?: boolean }) {
  const { value: s, update, flush, status, error } = useAutosave<StoriesData | null>('stories', save, initial);
  if (!s) return <p className="text-sm text-muted">Sem sequência de Stories.</p>;
  const frames = s.frames ?? [];
  const setF = (i: number, p: Partial<Frame>) => update({ ...s, frames: frames.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  const text = [`STORIES · ${s.dimensions ?? '1080x1920'}`, ...frames.map((f) => `Story ${f.number}: ${f.title}\n   ${f.body}`)].join('\n');
  return (
    <fieldset disabled={disabled} onBlur={flush} className="space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm text-muted">{frames.length} stories · {s.dimensions ?? '1080x1920'}</span><span className="flex items-center gap-2"><Status text={status} error={error} /><CopyButton text={text} label="Copiar sequência" /></span></div>
      {frames.map((f, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-line p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">Story {f.number ?? i + 1}</div>
          <input aria-label={`Título do story ${i + 1}`} value={f.title ?? ''} onChange={(e) => setF(i, { title: e.target.value })} className="input font-medium" />
          <textarea aria-label={`Texto do story ${i + 1}`} rows={2} value={f.body ?? ''} onChange={(e) => setF(i, { body: e.target.value })} className="input !text-xs" />
        </div>))}
    </fieldset>
  );
}

// ---------- Checklist ----------
export function ChecklistEditor({ initial, save, disabled }: { initial: ChecklistItem[]; save: SaveFn; disabled?: boolean }) {
  const { value: items, update, status, error } = useAutosave<ChecklistItem[]>('checklist', save, initial);
  const [novo, setNovo] = useState('');
  const done = items.filter((i) => i.done).length;
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm text-muted">{done} de {items.length} concluídos</span><Status text={status} error={error} /></div>
      <div className="h-2 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} /></div>
      <ul className="space-y-1.5">{items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-subtle/50">
          <input id={`ck-${i}`} type="checkbox" checked={it.done} onChange={(e) => update(items.map((x, k) => (k === i ? { ...x, done: e.target.checked } : x)), true)} />
          <label htmlFor={`ck-${i}`} className={`flex-1 text-sm ${it.done ? 'text-muted line-through' : ''}`}>{it.label}</label>
          <button type="button" className="text-xs text-muted hover:text-danger" aria-label={`Remover ${it.label}`} onClick={() => update(items.filter((_, k) => k !== i), true)}>×</button>
        </li>))}</ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (novo.trim()) { update([...items, { label: novo.trim(), done: false }], true); setNovo(''); } }}>
        <input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo item" className="input" aria-label="Novo item do checklist" /><button className="btn">Adicionar</button>
      </form>
    </fieldset>
  );
}
