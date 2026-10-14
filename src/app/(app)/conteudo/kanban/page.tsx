import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { FullBleed } from '@/components/kanban/FullBleed';
import { ProductionBoard, type BoardCard } from '@/components/content/ProductionBoard';
import { STAGES, filterPosts, isYm, BUCKETS } from '@/lib/content';
import { MONTHS_PT } from '@/lib/domain';

export const metadata = { title: 'Kanban de produção' };

type SP = { pilar?: string; campanha?: string; mes?: string; resp?: string; etapa?: string; grupo?: string; q?: string };

export default async function KanbanPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const sp = await searchParams;
  const { posts, pillars, campaigns, links, attachments, members } = await loadContent(supabase, ws.id);
  const month = isYm(sp.mes) ? sp.mes : sp.mes === 'sem-data' ? 'sem-data' : undefined;
  let list = filterPosts(posts, { pillar: sp.pilar, campaign: sp.campanha, status: sp.etapa, q: sp.q, assignee: sp.resp, bucket: sp.grupo && sp.grupo in BUCKETS ? sp.grupo : undefined, month: month && month !== 'sem-data' ? month : undefined }, links);
  if (month === 'sem-data') list = list.filter((p) => !p.publish_date);
  const pm = new Map(pillars.map((p) => [p.id, p])), cm = new Map(campaigns.map((c) => [c.id, c.name])), mm = new Map(members.map((m) => [m.id, m.name]));
  const cards: BoardCard[] = list.map((p) => ({
    id: p.id, title: p.title, pos: (p as { kanban_pos?: number | null }).kanban_pos ?? null, status: p.status, publish_date: p.publish_date, priority: p.priority, format: p.format, bucket: p.bucket, review_required: p.review_required,
    pillar: pm.get(p.pillar_id ?? '') ? { name: pm.get(p.pillar_id!)!.name, color: pm.get(p.pillar_id!)!.color } : null,
    campaigns: (links.get(p.id) ?? []).map((id) => cm.get(id) ?? '').filter(Boolean), assignee: p.assignee_id ? mm.get(p.assignee_id) ?? null : null,
    attachments: attachments.get(p.id) ?? 0, has_caption: p.has_caption, has_manychat: p.has_manychat,
  }));
  const months = [...new Set(posts.map((p) => p.publish_date?.slice(0, 7)).filter(Boolean) as string[])].sort();
  const filtered = sp.pilar || sp.campanha || sp.mes || sp.resp || sp.etapa || sp.grupo || sp.q;
  return (
    <>
      <FullBleed>
      <form className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Filtros do Kanban">
        <h1 className="mr-2 text-xl font-semibold tracking-tight">Kanban de produção</h1>
        <input name="q" defaultValue={sp.q} placeholder="Buscar…" className="input !w-48 !py-1.5 text-xs" aria-label="Buscar" />
        <details className="group relative" open={!!filtered && !sp.q}>
          <summary className="btn btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">Filtros{filtered && !sp.q ? ' •' : ''}</summary>
          <div className="absolute left-0 z-30 mt-2 grid w-72 gap-2 rounded-xl border border-line bg-surface p-3 shadow-xl">
        <select name="pilar" defaultValue={sp.pilar ?? ''} className="input !w-full !py-1.5 text-xs" aria-label="Pilar"><option value="">Todos os pilares</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="campanha" defaultValue={sp.campanha ?? ''} className="input !w-full !py-1.5 text-xs" aria-label="Campanha"><option value="">Todas as campanhas</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="mes" defaultValue={sp.mes ?? ''} className="input !w-full !py-1.5 text-xs" aria-label="Mês"><option value="">Todos os meses</option>{months.map((m) => <option key={m} value={m}>{MONTHS_PT[Number(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}<option value="sem-data">Sem data</option></select>
        <select name="resp" defaultValue={sp.resp ?? ''} className="input !w-full !py-1.5 text-xs" aria-label="Responsável"><option value="">Todos os responsáveis</option><option value="nenhum">Sem responsável</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        <select name="etapa" defaultValue={sp.etapa ?? ''} className="input !w-full !py-1.5 text-xs" aria-label="Status"><option value="">Todos os status</option>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <select name="grupo" defaultValue={sp.grupo ?? ''} className="input !w-full !py-1.5 text-xs" aria-label="Grupo"><option value="">Calendário + acervo + ideias</option>{Object.entries(BUCKETS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="btn btn-sm btn-primary">Aplicar filtros</button>
          </div>
        </details>
        {filtered && <Link href="/conteudo/kanban" className="text-xs underline">Limpar</Link>}
        <span className="text-xs text-muted" title="✎ legenda · 💬 ManyChat (rascunho) · 📎 anexos · ● revisão necessária. Arraste os cartões entre as etapas; “Publicado” exige data/hora reais e confirmação.">{cards.length} cartão(ões) · arraste para mover</span>
        {open && <Link href="/conteudo/novo" className="btn btn-primary btn-sm ml-auto">Novo conteúdo</Link>}
      </form>
      <ProductionBoard cards={cards} canEdit={open} />
      </FullBleed>
    </>
  );
}
