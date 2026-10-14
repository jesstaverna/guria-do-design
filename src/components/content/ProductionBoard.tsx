'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { useDragScroll, useFillViewport } from '@/components/useDragScroll';
import { movePostStage } from '@/app/(app)/conteudo/actions';
import { STAGES, PRIORITY_LABEL, type StageKey } from '@/lib/content';
import { FORMATS } from '@/lib/domain';
import { dateBR } from '@/lib/format';
import { PublishDialog } from './PublishDialog';

export interface BoardCard {
  id: string; title: string; status: StageKey; publish_date: string | null; priority: string; format: string; pillar: { name: string; color: string } | null;
  campaigns: string[]; assignee: string | null; attachments: number; has_caption: boolean; has_manychat: boolean; bucket: string; review_required: boolean;
}

/** Kanban de produção: arrastar entre colunas grava no banco; calendário, pilares e painel leem os mesmos registros. */
export function ProductionBoard({ cards, canEdit }: { cards: BoardCard[]; canEdit: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(cards);
  const [pending, start] = useTransition();
  const [error, setError] = useState('');
  const [over, setOver] = useState<StageKey | null>(null);
  const [publish, setPublish] = useState<BoardCard | null>(null);
  const scroller = useRef<HTMLDivElement>(null); useDragScroll(scroller); useFillViewport(scroller);
  const [lastCards, setLastCards] = useState(cards);
  if (cards !== lastCards) { setLastCards(cards); setItems(cards); }   // sincroniza quando o servidor reenvia

  function commit(card: BoardCard, stage: StageKey, opts?: { publishedAt?: string; confirmed?: boolean }) {
    const before = items;
    setItems((cur) => cur.map((c) => (c.id === card.id ? { ...c, status: stage } : c))); setError('');
    start(async () => {
      const r = await movePostStage(card.id, stage, opts);
      if ('error' in r) { setError(r.error); setItems(before); } else router.refresh();
    });
  }
  function move(id: string, stage: StageKey) {
    const card = items.find((c) => c.id === id);
    if (!canEdit || !card || card.status === stage) return;
    if (stage === 'publicado') { setPublish(card); return; }
    commit(card, stage);
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <div ref={scroller} className={`relative flex h-[calc(100dvh-26rem)] min-h-[20rem] gap-4 overflow-x-auto pb-4 ${pending ? 'opacity-80' : ''}`}>
        {STAGES.map((s) => {
          const col = items.filter((c) => c.status === s.key);
          return (
            <section key={s.key} aria-label={s.label}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(s.key); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), s.key); }}
              className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-subtle/50 p-3 ${over === s.key ? 'border-accent' : 'border-line'}`}>
              <header className="mb-3 flex shrink-0 items-baseline justify-between px-1.5"><h3 className="text-sm font-semibold">{s.label}</h3><span className="rounded-full bg-surface px-2 text-xs text-muted">{col.length}</span></header>
              <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
                {col.map((c) => (
                  <article key={c.id} draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                    className={`rounded-xl border border-line bg-surface p-3 ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ borderLeft: `4px solid ${c.pillar?.color ?? 'rgb(var(--line))'}` }}>
                    <Link href={`/conteudo/${c.id}`} className="text-sm font-medium leading-snug hover:underline">{c.title}</Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      <span>{c.publish_date ? dateBR(c.publish_date) : c.bucket === 'acervo' ? 'Acervo' : c.bucket === 'remanejado' ? 'Remanejado' : 'Sem data'}</span><span>· {FORMATS[c.format] ?? c.format}</span>
                      {c.priority !== 'media' && <span className="font-medium text-warn">· {PRIORITY_LABEL[c.priority]}</span>}
                    </div>
                    {c.pillar && <div className="mt-1.5 text-[11px]"><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: c.pillar.color }} />{c.pillar.name}</div>}
                    {!!c.campaigns.length && <div className="mt-1.5 flex flex-wrap gap-1">{c.campaigns.map((n) => <span key={n} className="rounded-full bg-subtle px-2 py-0.5 text-[10px] text-muted">{n}</span>)}</div>}
                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                      <span className="flex gap-2" aria-label="Indicadores">
                        <span title={c.has_caption ? 'Legenda pronta' : 'Sem legenda'} className={c.has_caption ? '' : 'opacity-30'}>✎</span>
                        <span title={c.has_manychat ? 'ManyChat (rascunho)' : 'Sem ManyChat'} className={c.has_manychat ? '' : 'opacity-30'}>💬</span>
                        <span title="Anexos" className={c.attachments ? '' : 'opacity-30'}>📎{c.attachments || ''}</span>
                        {c.review_required && <span title="Revisão necessária antes de publicar" className="text-warn">●</span>}
                      </span>
                      <span className="truncate">{c.assignee ?? ''}</span>
                    </div>
                    {canEdit && (<>
                      <label className="sr-only" htmlFor={`mv-${c.id}`}>Mover {c.title}</label>
                      <select id={`mv-${c.id}`} value={c.status} onChange={(e) => move(c.id, e.target.value as StageKey)} className="mt-2 w-full rounded-lg border border-line bg-surface px-2 py-1 text-xs">
                        {STAGES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                      </select></>)}
                  </article>
                ))}
                {!col.length && <p className="px-1.5 py-6 text-center text-xs text-muted">{canEdit ? 'Arraste um conteúdo para cá' : 'Vazio'}</p>}
              </div>
            </section>
          );
        })}
      </div>
      <PublishDialog open={!!publish} title={publish?.title ?? ''} onCancel={() => setPublish(null)}
        onConfirm={(iso) => { const c = publish!; setPublish(null); commit(c, 'publicado', { publishedAt: iso, confirmed: true }); }} />
    </div>
  );
}
