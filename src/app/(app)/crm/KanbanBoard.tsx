'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { useDragScroll, useFillViewport } from '@/components/useDragScroll';
import { KanbanDnd, type DropInfo, type DropResult, type KColumn } from '@/components/kanban/KanbanDnd';
import { moveLead, reorderLeads } from './actions';

export interface KLead { id: string; name: string; company: string | null; potential_value_cents: number; owner: string | null; stage_id: string; daysSinceContact: number; stale: boolean; pos: number | null }
export interface KStage { id: string; name: string; kind: 'open' | 'won' | 'lost' }

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Kanban do CRM: arraste os leads (como no Trello) entre as etapas e dentro da etapa; a ordem fica salva. */
export function KanbanBoard({ stages, leads, canEdit }: { stages: KStage[]; leads: KLead[]; canEdit: boolean }) {
  const router = useRouter();
  const scroller = useRef<HTMLDivElement>(null); useDragScroll(scroller); useFillViewport(scroller);
  const [local, setLocal] = useState(leads);
  const [lastLeads, setLastLeads] = useState(leads);
  const [error, setError] = useState<string | null>(null);
  if (leads !== lastLeads) { setLastLeads(leads); setLocal(leads); }

  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const columns: KColumn[] = useMemo(() => stages.map((s) => ({
    id: s.id, label: s.name,
    header: (n) => { const total = local.filter((l) => l.stage_id === s.id).reduce((a, l) => a + Number(l.potential_value_cents), 0); return <div className="flex items-baseline justify-between"><h3 className="text-sm font-semibold">{s.name}</h3><span className="text-xs text-muted">{n} · {brl(total)}</span></div>; },
  })), [stages, local]);
  const items = useMemo(() => local.map((l, i) => ({ ...l, col: l.stage_id, _i: i })).sort((a, b) => (a.pos ?? Infinity) - (b.pos ?? Infinity) || a._i - b._i), [local]);

  async function onDrop(d: DropInfo): Promise<DropResult> {
    const lead = local.find((l) => l.id === d.id); const stage = stageById.get(d.to);
    if (!lead || !stage) return 'revert';
    let reason: string | undefined;
    if (d.from !== d.to && stage.kind === 'lost') {
      const r = window.prompt('Motivo da perda (obrigatório):');
      if (!r?.trim()) return 'revert';
      reason = r;
    }
    setError(null); const before = local;
    setLocal((cur) => cur.map((l) => { const i = d.ordered.indexOf(l.id); return i >= 0 ? { ...l, pos: (i + 1) * 1000, ...(l.id === d.id ? { stage_id: d.to } : {}) } : l; }));
    if (d.from !== d.to) { const err = await moveLead(d.id, d.to, reason); if (err) { setError(err); setLocal(before); return 'revert'; } }
    const err2 = await reorderLeads(d.ordered); if (err2) { setError(err2); setLocal(before); return 'revert'; }
    router.refresh(); return 'ok';
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
      <KanbanDnd columns={columns} items={items} canEdit={canEdit} onDrop={onDrop} boardRef={scroller} boardClassName="h-[calc(100dvh-26rem)] min-h-[20rem]"
        renderCard={(l) => (
          <article className="rounded-xl border border-line bg-surface p-3.5">
            <Link href={`/crm/${l.id}`} onPointerDown={(e) => e.stopPropagation()} className="text-sm font-medium hover:underline">{l.name}</Link>
            {l.company && <div className="text-xs text-muted">{l.company}</div>}
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="font-medium">{brl(Number(l.potential_value_cents))}</span>
              <span className="text-muted">{l.owner ?? 'Sem resp.'}</span>
            </div>
            {l.stale && stageById.get(l.stage_id)?.kind === 'open' && <div className="mt-2 rounded-md bg-amber-500/15 px-2 py-1 text-[11px] text-warn">Sem contato há {l.daysSinceContact} dias</div>}
          </article>
        )} />
    </div>
  );
}
