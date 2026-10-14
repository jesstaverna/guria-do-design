'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { movePostStage, reorderColumn } from '@/app/(app)/conteudo/actions';
import { STAGES, PRIORITY_LABEL, type StageKey } from '@/lib/content';
import { FORMATS } from '@/lib/domain';
import { dateBR } from '@/lib/format';
import { useDragScroll, useFillViewport } from '@/components/useDragScroll';
import { KanbanDnd, type DropInfo, type DropResult, type KColumn } from '@/components/kanban/KanbanDnd';
import { PublishDialog } from './PublishDialog';

export interface BoardCard {
  id: string; title: string; pos: number | null; status: StageKey; publish_date: string | null; priority: string; format: string; pillar: { name: string; color: string } | null;
  campaigns: string[]; assignee: string | null; attachments: number; has_caption: boolean; has_manychat: boolean; bucket: string; review_required: boolean;
}
type Item = BoardCard & { col: string };

const COLUMNS: KColumn[] = STAGES.map((s) => ({ id: s.key, label: s.label, header: (n) => <div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold">{s.label}</h3><span className="rounded-full bg-surface px-2 text-xs text-muted">{n}</span></div> }));

/** Kanban de produção: arrastar (como no Trello) grava etapa e posição no banco; calendário, pilares e painel leem os mesmos registros. */
export function ProductionBoard({ cards, canEdit }: { cards: BoardCard[]; canEdit: boolean }) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null); useDragScroll(scroller); useFillViewport(scroller);
  const [local, setLocal] = useState<BoardCard[]>(cards);
  const [lastCards, setLastCards] = useState(cards);
  const [error, setError] = useState('');
  const [publish, setPublish] = useState<{ card: BoardCard; ordered: string[] } | null>(null);
  if (cards !== lastCards) { setLastCards(cards); setLocal(cards); }   // sincroniza quando o servidor reenvia

  // ordem dentro da coluna: posição gravada; sem posição, no fim (mantendo a ordem original)
  const items: Item[] = useMemo(() => local.map((c, i) => ({ ...c, col: c.status, _i: i })).sort((a, b) => (a.pos ?? Infinity) - (b.pos ?? Infinity) || (a as { _i: number })._i - (b as { _i: number })._i), [local]);

  async function persist(card: BoardCard, to: StageKey, ordered: string[], moved: boolean, opts?: { publishedAt?: string; confirmed?: boolean }): Promise<DropResult> {
    setError('');
    const before = local;
    setLocal((cur) => cur.map((c) => { const i = ordered.indexOf(c.id); return i >= 0 ? { ...c, pos: (i + 1) * 1000, ...(c.id === card.id ? { status: to } : {}) } : c; }));
    if (moved) { const r = await movePostStage(card.id, to, opts); if ('error' in r) { setError(r.error); setLocal(before); return 'revert'; } }
    const r2 = await reorderColumn(ordered); if ('error' in r2) { setError(r2.error); setLocal(before); return 'revert'; }
    router.refresh(); return 'ok';
  }
  async function onDrop(d: DropInfo): Promise<DropResult> {
    const card = local.find((c) => c.id === d.id); if (!card) return 'revert';
    if (d.to === 'publicado' && d.from !== 'publicado') { setPublish({ card, ordered: d.ordered }); return 'revert'; }   // pede data real + confirmação antes
    return persist(card, d.to as StageKey, d.ordered, d.from !== d.to);
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <KanbanDnd columns={COLUMNS} items={items} canEdit={canEdit} onDrop={onDrop} boardRef={scroller} boardClassName="h-[calc(100dvh-26rem)] min-h-[20rem]"
        renderCard={(c) => (
          <article className="rounded-xl border border-line bg-surface p-3" style={{ borderLeft: `4px solid ${c.pillar?.color ?? 'rgb(var(--line))'}` }}>
            <Link href={`/conteudo/${c.id}`} onPointerDown={(e) => e.stopPropagation()} className="text-sm font-medium leading-snug hover:underline">{c.title}</Link>
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
          </article>
        )} />
      <PublishDialog open={!!publish} title={publish?.card.title ?? ''} onCancel={() => setPublish(null)}
        onConfirm={(iso) => { const p = publish!; setPublish(null); void persist(p.card, 'publicado', p.ordered, true, { publishedAt: iso, confirmed: true }); }} />
    </div>
  );
}
