import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { Empty, Field, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { ProgressBar } from '@/components/Charts';
import { contentStats } from '@/lib/content';
import { pct } from '@/lib/format';
import { deleteCampaign, deletePillar, saveCampaign, savePillar, togglePillar } from '../actions';

export const metadata = { title: 'Pilares de conteúdo' };

function PillarForm({ p }: { p?: { id: string; name: string; description?: string | null; objective?: string | null; color: string; position: number } }) {
  return (
    <form action={savePillar} className="grid gap-3 sm:grid-cols-2">
      {p && <input type="hidden" name="id" value={p.id} />}
      <Field label="Nome *"><input name="name" required defaultValue={p?.name} className="input" /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Cor"><input name="color" type="color" defaultValue={p?.color ?? '#B00BB5'} className="h-11 w-full rounded-xl border border-line bg-surface p-1" /></Field><Field label="Posição"><input name="position" type="number" min={0} max={99} defaultValue={p?.position ?? 0} className="input" /></Field></div>
      <Field label="Objetivo" className="sm:col-span-2"><input name="objective" defaultValue={p?.objective ?? ''} className="input" placeholder="Ex.: educar e gerar salvamentos" /></Field>
      <Field label="Descrição" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={p?.description ?? ''} className="input" /></Field>
      <div className="sm:col-span-2"><SubmitButton pendingText="…">Salvar pilar</SubmitButton></div>
    </form>
  );
}

export default async function Pilares() {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const { posts, pillars, campaigns, links } = await loadContent(supabase, ws.id);
  const s = contentStats(posts, pillars);
  const stat = new Map(s.byPillar.map((b) => [b.id, b]));
  const campCount = new Map<string, number>();
  links.forEach((ids) => ids.forEach((c) => campCount.set(c, (campCount.get(c) ?? 0) + 1)));
  return (
    <>
      <PageHeader title="Pilares de conteúdo" subtitle="Cada conteúdo pertence a UM pilar. Campanhas são tags transversais e não são pilares." actions={open && <Link href="/conteudo/novo" className="btn btn-primary">Novo conteúdo</Link>} />
      {!pillars.length ? <Empty title="Nenhum pilar" text="Crie os 3 a 5 temas que sustentam sua comunicação, ou importe o planejamento." /> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {pillars.map((p) => {
            const b = stat.get(p.id)!;
            return (
              <article key={p.id} className={`card flex flex-col !p-5 ${p.active ? '' : 'opacity-60'}`} style={{ borderTop: `4px solid ${p.color}` }}>
                <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{p.name}</h3><span className="text-xs text-muted">#{p.position}</span></div>
                {p.objective && <p className="mt-1 text-xs font-medium" style={{ color: p.color }}>{p.objective}</p>}
                {p.description && <p className="mt-2 text-sm text-muted">{p.description}</p>}
                <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                  {[['Total', b.total], ['Com data', b.withDate], ['Em produção', b.inProduction], ['Publicados', b.published]].map(([l, v]) => <div key={l as string} className="rounded-xl bg-subtle/60 px-1 py-2"><dd className="text-lg font-semibold">{v}</dd><dt className="text-[10px] uppercase tracking-wider text-muted">{l}</dt></div>)}
                </dl>
                <div className="mt-4"><div className="mb-1 flex justify-between text-xs"><span className="text-muted">Participação no calendário</span><span>{pct(b.share)}</span></div><ProgressBar value={b.share} /></div>
                <div className="mt-2"><div className="mb-1 flex justify-between text-xs"><span className="text-muted">Publicados do que tem data</span><span>{b.withDate ? pct((b.published / b.withDate) * 100) : '—'}</span></div><ProgressBar value={b.withDate ? (b.published / b.withDate) * 100 : 0} tone="ok" /></div>
                <p className="mt-2 text-[11px] text-muted">{b.scripted} em roteiro · {b.ideas} ideias</p>
                {open && (
                  <details className="mt-4 border-t border-line pt-3 text-sm"><summary className="cursor-pointer text-muted hover:text-fg">Editar</summary>
                    <div className="mt-3 space-y-3"><PillarForm p={p} />
                      <div className="flex gap-3 text-xs"><form action={togglePillar.bind(null, p.id, !p.active)}><SubmitButton className="underline" pendingText="…">{p.active ? 'Desativar' : 'Ativar'}</SubmitButton></form>
                        <form action={deletePillar.bind(null, p.id)}><SubmitButton className="text-danger underline" pendingText="…" confirm="Excluir este pilar?">Excluir</SubmitButton></form></div></div></details>)}
              </article>
            );
          })}
        </div>
      )}
      {open && <details className="card mt-6 !p-4"><summary className="cursor-pointer text-sm font-medium">+ Novo pilar</summary><div className="mt-4"><PillarForm /></div></details>}
      <div className="mt-8"><Section title="Campanhas e editorias (tags transversais)">
        {!campaigns.length ? <p className="text-sm text-muted">Nenhuma campanha.</p> : (
          <ul className="divide-y divide-line">{campaigns.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{[c.period, c.kind, c.status].filter(Boolean).join(' · ')}{c.notes ? ` — ${c.notes}` : ''}</div></div>
              <div className="flex items-center gap-3"><Link href={`/conteudo/kanban?campanha=${c.id}`} className="badge hover:bg-subtle">{campCount.get(c.id) ?? 0} conteúdo(s)</Link>
                {open && <form action={deleteCampaign.bind(null, c.id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover esta campanha? Os conteúdos continuam.">Remover</SubmitButton></form>}</div></li>))}</ul>)}
        {open && <form action={saveCampaign} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-4"><Field label="Nome" className="sm:col-span-2"><input name="name" required className="input" /></Field><Field label="Período"><input name="period" placeholder="2026-11" className="input" /></Field><div className="flex items-end"><SubmitButton pendingText="…">Criar campanha</SubmitButton></div></form>}
      </Section></div>
    </>
  );
}
