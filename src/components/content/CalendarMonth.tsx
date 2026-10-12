'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { reschedulePost } from '@/app/(app)/conteudo/actions';
import { STAGE_LABEL, type StageKey } from '@/lib/content';
import { FORMATS } from '@/lib/domain';

export interface CalPost { id: string; title: string; date: string; status: StageKey; format: string; network: string; color: string; pillar: string | null }

/** Grade mensal (semana começa na segunda). Arrastar um conteúdo para outro dia REAGENDA a data editorial (não agenda nada em rede social). */
export function CalendarMonth({ weeks, posts, today, canEdit, newHref }: { weeks: { date: string; inMonth: boolean }[][]; posts: CalPost[]; today: string; canEdit: boolean; newHref?: string }) {
  const router = useRouter();
  const [items, setItems] = useState(posts);
  const [last, setLast] = useState(posts);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [over, setOver] = useState<string | null>(null);
  if (posts !== last) { setLast(posts); setItems(posts); }

  function drop(date: string, id: string) {
    const p = items.find((x) => x.id === id);
    if (!canEdit || !p || p.date === date) return;
    const before = items; setItems((c) => c.map((x) => (x.id === id ? { ...x, date } : x))); setErr('');
    start(async () => { const r = await reschedulePost(id, date); if ('error' in r) { setErr(r.error); setItems(before); } else router.refresh(); });
  }
  const byDay = new Map<string, CalPost[]>();
  items.forEach((p) => byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]));
  return (
    <div className={pending ? 'opacity-80' : ''}>
      {err && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
      <div className="overflow-x-auto"><div className="min-w-[760px] overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="grid grid-cols-7 border-b border-line bg-subtle/50 text-center text-xs font-medium uppercase tracking-wider text-muted">{['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
        {weeks.map((w, wi) => (
          <div key={wi} className="grid grid-cols-7 divide-x divide-line border-b border-line last:border-b-0">
            {w.map((c) => {
              const list = byDay.get(c.date) ?? [];
              return (
                <div key={c.date} onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(c.date); } }} onDragLeave={() => setOver(null)} onDrop={(e) => { e.preventDefault(); setOver(null); drop(c.date, e.dataTransfer.getData('text/plain')); }}
                  className={`min-h-28 p-1.5 ${c.inMonth ? '' : 'bg-subtle/40'} ${c.date === today ? 'bg-accent/5' : ''} ${over === c.date ? 'outline outline-2 -outline-offset-2 outline-accent' : ''}`}>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    {canEdit && c.inMonth && newHref ? <Link href={`${newHref}?date=${c.date}`} className="opacity-0 hover:opacity-100 focus:opacity-100" aria-label={`Novo conteúdo em ${c.date.split('-').reverse().join('/')}`}>+</Link> : <span />}
                    <span className={c.date === today ? 'grid h-5 w-5 place-items-center rounded-full bg-accent font-bold text-on-accent' : ''}>{Number(c.date.slice(8))}</span>
                  </div>
                  <div className="space-y-1">{list.map((p) => (
                    <Link key={p.id} href={`/conteudo/${p.id}`} draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
                      title={`${p.title} · ${FORMATS[p.format] ?? p.format} · ${STAGE_LABEL[p.status]}${p.pillar ? ` · ${p.pillar}` : ''}`}
                      className={`block truncate rounded border-l-4 bg-subtle px-1.5 py-0.5 text-[11px] leading-snug hover:bg-subtle/70 ${p.status === 'publicado' ? 'opacity-60' : ''}`} style={{ borderColor: p.color }}>
                      <span className="mr-1 text-[9px] uppercase text-muted">{p.format === 'carrossel' ? 'car' : p.format.slice(0, 3)}</span>{p.title}
                    </Link>))}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div></div>
    </div>
  );
}
