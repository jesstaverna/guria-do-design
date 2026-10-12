import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { Empty, PageHeader, Section, Badge } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { STAGE_LABEL, filterPosts } from '@/lib/content';
import { FORMATS } from '@/lib/domain';
import { scheduleFromReserve } from '../actions';

export const metadata = { title: 'Acervo reserva' };

const GROUPS = [
  { key: 'acervo', title: 'Acervo reserva (nostalgia)', text: 'Roteiros prontos sem data. Ficam guardados até você decidir levá-los ao calendário.' },
  { key: 'remanejado', title: 'Posts remanejados', text: 'Saíram do calendário e conservam o roteiro completo. Nada é excluído.' },
  { key: 'ideia', title: 'Ideias extras e backlog', text: 'Ideias sem roteiro completo ou sem data.' },
] as const;

export default async function Acervo({ searchParams }: { searchParams: Promise<{ pilar?: string; campanha?: string; q?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const sp = await searchParams;
  const { posts, pillars, campaigns, links } = await loadContent(supabase, ws.id);
  const list = filterPosts(posts.filter((p) => p.bucket !== 'calendario'), { pillar: sp.pilar, campaign: sp.campanha, q: sp.q }, links);
  const pm = new Map(pillars.map((p) => [p.id, p]));
  return (
    <>
      <PageHeader title="Acervo reserva" subtitle="Conteúdos SEM data, separados das publicações do calendário. Dar uma data é uma ação explícita sua." />
      <form className="mb-6 flex flex-wrap gap-2" aria-label="Filtros">
        <input name="q" defaultValue={sp.q} placeholder="Buscar…" className="input !w-52 !py-1.5 text-xs" aria-label="Buscar" />
        <select name="pilar" defaultValue={sp.pilar ?? ''} className="input !w-auto !py-1.5 text-xs" aria-label="Pilar"><option value="">Todos os pilares</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="campanha" defaultValue={sp.campanha ?? ''} className="input !w-auto !py-1.5 text-xs" aria-label="Campanha"><option value="">Todas as campanhas</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn btn-sm">Filtrar</button>
      </form>
      {!list.length && <Empty title="Acervo vazio" text="Itens do acervo e ideias sem data aparecem aqui." />}
      <div className="space-y-8">
        {GROUPS.map((g) => {
          const items = list.filter((p) => p.bucket === g.key);
          if (!items.length) return null;
          return (
            <Section key={g.key} title={`${g.title} · ${items.length}`}>
              <p className="-mt-2 mb-4 text-sm text-muted">{g.text}</p>
              <ul className="divide-y divide-line">{items.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1"><Link href={`/conteudo/${p.id}`} className="font-medium hover:underline">{p.title}</Link>
                    {p.hook && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{p.hook}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                      {p.pillar_id && pm.get(p.pillar_id) && <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: pm.get(p.pillar_id)!.color }} />{pm.get(p.pillar_id)!.name}</span>}
                      <Badge>{STAGE_LABEL[p.status]}</Badge><span>{FORMATS[p.format] ?? p.format}{p.cards_count ? ` · ${p.cards_count} cards` : ''}</span>{p.keyword && <span className="font-mono">{p.keyword}</span>}</div></div>
                  {open && <form action={scheduleFromReserve.bind(null, p.id)} className="flex items-center gap-2"><input name="publish_date" type="date" required className="input !w-auto !py-1.5 text-xs" aria-label={`Data editorial de ${p.title}`} /><SubmitButton className="btn btn-sm" pendingText="…" confirm="Levar este conteúdo ao calendário com esta data editorial? (Nada será agendado em rede social.)">Levar ao calendário</SubmitButton></form>}
                </li>))}</ul>
            </Section>
          );
        })}
      </div>
    </>
  );
}
