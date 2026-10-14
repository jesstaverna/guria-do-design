'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, closestCorners, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface KColumn { id: string; label: string; header: (count: number) => ReactNode; className?: string }
export interface KItem { id: string; col: string }
export interface DropInfo { id: string; from: string; to: string; ordered: string[] }
/** 'ok' = mantém a nova posição; 'revert' = volta o cartão para onde estava (ex.: pedindo confirmação antes). */
export type DropResult = 'ok' | 'revert';

type Layout = Record<string, string[]>;
const layoutOf = (columns: KColumn[], items: KItem[]): Layout => Object.fromEntries(columns.map((c) => [c.id, items.filter((i) => i.col === c.id).map((i) => i.id)]));
const sameLayout = (a: Layout, b: Layout) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k].length === b[k]?.length && a[k].every((v, i) => v === b[k][i]));

function Card({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} {...attributes} {...(disabled ? {} : listeners)}
      className={`touch-manipulation outline-none ${isDragging ? 'opacity-40' : ''} ${disabled ? '' : 'cursor-grab'}`}>{children}</div>
  );
}

function Column({ col, ids, canEdit, render, byId }: { col: KColumn; ids: string[]; canEdit: boolean; render: (id: string, overlay?: boolean) => ReactNode; byId: (id: string) => boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <section ref={setNodeRef} aria-label={col.label} data-col={col.id}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-subtle/50 p-3 transition-colors ${isOver ? 'border-accent bg-accent/5' : 'border-line'} ${col.className ?? ''}`}>
      <header className="mb-3 shrink-0 px-1.5">{col.header(ids.length)}</header>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.filter(byId).map((id) => <Card key={id} id={id} disabled={!canEdit}>{render(id)}</Card>)}
        </SortableContext>
        {ids.length === 0 && <div className="grid h-16 place-items-center rounded-xl border border-dashed border-line text-xs text-muted">Solte um cartão aqui</div>}
      </div>
    </section>
  );
}

/**
 * Quadro estilo Trello: pegue o cartão (mouse ou toque), ele flutua e inclina; um espaço mostra onde vai cair;
 * a rolagem acompanha nas bordas; solte em qualquer posição de qualquer coluna.
 */
export function KanbanDnd<T extends KItem>({ columns, items, canEdit, renderCard, onDrop, boardRef, boardClassName = '' }: {
  columns: KColumn[]; items: T[]; canEdit: boolean; renderCard: (item: T, overlay: boolean) => ReactNode;
  onDrop: (d: DropInfo) => Promise<DropResult>; boardRef?: React.RefObject<HTMLDivElement | null>; boardClassName?: string;
}) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const fromProps = useMemo(() => layoutOf(columns, items), [columns, items]);
  const [layout, setLayout] = useState<Layout>(fromProps);
  const [active, setActive] = useState<string | null>(null);
  const startLayout = useRef<Layout>(fromProps);
  // sincroniza com o servidor (mas nunca no meio de um arrasto)
  useEffect(() => { if (!active) setLayout(fromProps); }, [fromProps, active]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collision: CollisionDetection = (args) => { const p = pointerWithin(args); return p.length ? p : closestCorners(args); };
  const colOf = (id: string, l: Layout) => (id in l ? id : Object.keys(l).find((c) => l[c].includes(id)));

  function onStart(e: DragStartEvent) { setActive(String(e.active.id)); startLayout.current = layout; }
  function onOver(e: DragOverEvent) {
    const { active: a, over } = e; if (!over) return;
    const aid = String(a.id), oid = String(over.id);
    setLayout((cur) => {
      const from = colOf(aid, cur), to = colOf(oid, cur); if (!from || !to || from === to) return cur;
      const dest = cur[to]; const overIdx = oid in cur ? dest.length : dest.indexOf(oid);
      const below = over.rect && a.rect.current.translated && a.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const at = oid in cur ? dest.length : overIdx + (below ? 1 : 0);
      return { ...cur, [from]: cur[from].filter((x) => x !== aid), [to]: [...dest.slice(0, at), aid, ...dest.slice(at)] };
    });
  }
  async function onEnd(e: DragEndEvent) {
    const aid = String(e.active.id); const over = e.over ? String(e.over.id) : null; setActive(null);
    if (!over) { setLayout(startLayout.current); return; }
    let next = layout; const col = colOf(aid, layout)!;
    if (over !== aid && !(over in layout) && layout[col].includes(over)) {
      const oldI = layout[col].indexOf(aid), newI = layout[col].indexOf(over);
      if (oldI !== newI) next = { ...layout, [col]: arrayMove(layout[col], oldI, newI) };
    }
    setLayout(next);
    const from = colOf(aid, startLayout.current)!, to = colOf(aid, next)!;
    if (from === to && sameLayout(startLayout.current, next)) return;
    const r = await onDrop({ id: aid, from, to, ordered: next[to] });
    if (r === 'revert') setLayout(startLayout.current);
  }

  const activeItem = active ? byId.get(active) : null;
  return (
    <DndContext id="kanban-dnd" sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd} onDragCancel={() => { setActive(null); setLayout(startLayout.current); }}>
      <div ref={boardRef} className={`relative flex gap-4 overflow-x-auto pb-4 ${boardClassName}`}>
        {columns.map((c) => <Column key={c.id} col={c} ids={layout[c.id] ?? []} canEdit={canEdit} byId={(id) => byId.has(id)} render={(id) => renderCard(byId.get(id)!, false)} />)}
      </div>
      <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
        {activeItem ? <div className="w-[17rem] rotate-[3deg] cursor-grabbing shadow-2xl shadow-black/25">{renderCard(activeItem, true)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}
