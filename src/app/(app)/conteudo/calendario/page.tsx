import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { PageHeader } from '@/components/ui';
import { Badge } from '@/components/ui';
import { CalendarMonth, type CalPost } from '@/components/content/CalendarMonth';
import { STAGES, STAGE_LABEL, filterPosts, isDate, isYm, monthGridMon, shiftMonth, weekDaysMon, type PostFilters } from '@/lib/content';
import { FORMATS, MONTHS_PT, NETWORKS, addDays, todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';

export const metadata = { title: 'Calendário editorial' };

type SP = { view?: string; m?: string; d?: string; mes?: string; ano?: string; pilar?: string; campanha?: string; etapa?: string; formato?: string; q?: string };
const WD = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export default async function Calendario({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const sp = await searchParams;
  const today = todayBR();
  const view = sp.view === 'semana' ? 'semana' : sp.view === 'lista' ? 'lista' : 'mes';
  const fromSel = /^\d{1,2}$/.test(sp.mes ?? '') && /^\d{4}$/.test(sp.ano ?? '') ? `${sp.ano}-${String(Number(sp.mes)).padStart(2, '0')}` : null;
  const ym = isYm(fromSel) ? fromSel : isYm(sp.m) ? sp.m : today.slice(0, 7);
  const anchor = isDate(sp.d) ? sp.d : ym === today.slice(0, 7) ? today : `${ym}-01`;
  const { posts, pillars, campaigns, links } = await loadContent(supabase, ws.id);
  const f: PostFilters = { pillar: sp.pilar, campaign: sp.campanha, status: sp.etapa, format: sp.formato, q: sp.q };
  const dated = filterPosts(posts.filter((p) => p.publish_date), f, links);
  const pm = new Map(pillars.map((p) => [p.id, p]));
  const toCal = (p: (typeof dated)[number]): CalPost => ({ id: p.id, title: p.title, date: p.publish_date!, status: p.status, format: p.format, network: p.network, color: pm.get(p.pillar_id ?? '')?.color ?? '#999999', pillar: pm.get(p.pillar_id ?? '')?.name ?? null });
  const [y, mo] = ym.split('-').map(Number);
  const counts: Record<string, number> = {};
  posts.filter((p) => p.bucket === 'calendario' && p.publish_date).forEach((p) => { const k = p.publish_date!.slice(0, 7); counts[k] = (counts[k] ?? 0) + 1; });

  const qs = (o: Record<string, string | undefined>) => { const p = new URLSearchParams(Object.entries({ view: view === 'mes' ? undefined : view, pilar: sp.pilar, campanha: sp.campanha, etapa: sp.etapa, formato: sp.formato, q: sp.q, ...o }).filter(([, v]) => v) as [string, string][]); return `/conteudo/calendario${p.size ? `?${p}` : ''}`; };
  const weekDays = weekDaysMon(anchor);
  const prev = view === 'semana' ? qs({ d: addDays(anchor, -7), m: addDays(anchor, -7).slice(0, 7) }) : qs({ m: shiftMonth(ym, -1) });
  const next = view === 'semana' ? qs({ d: addDays(anchor, 7), m: addDays(anchor, 7).slice(0, 7) }) : qs({ m: shiftMonth(ym, 1) });
  const title = view === 'semana' ? `${dateBR(weekDays[0]).slice(0, 5)} a ${dateBR(weekDays[6])}` : `${MONTHS_PT[mo - 1]} ${y}`;
  const monthPosts = dated.filter((p) => p.publish_date!.startsWith(ym));
  const years = [...new Set([...Object.keys(counts).map((k) => Number(k.slice(0, 4))), y, Number(today.slice(0, 4))])].sort();
  const stageTone = (s: string) => (s === 'publicado' ? 'bg-ok/15 text-ok' : s === 'ideia' ? 'bg-subtle text-muted' : 'bg-accent/15 text-accent-ink');

  return (
    <>
      <PageHeader title="Calendário editorial" subtitle="Datas do planejamento. Uma data aqui NÃO significa que o post está agendado no Instagram." actions={open && <Link href="/conteudo/novo" className="btn btn-primary">Novo conteúdo</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1"><Link href={prev} className="btn btn-sm" aria-label="Anterior">←</Link><span className="min-w-40 text-center text-sm font-semibold capitalize">{title}</span><Link href={next} className="btn btn-sm" aria-label="Próximo">→</Link><Link href={qs({ m: today.slice(0, 7), d: today })} className="btn btn-sm">Hoje</Link></div>
        <div className="flex overflow-hidden rounded-xl border border-line" role="group" aria-label="Visualização">{([['mes', 'Mês'], ['semana', 'Semana'], ['lista', 'Lista']] as const).map(([k, l]) => <Link key={k} href={qs({ view: k === 'mes' ? undefined : k, m: ym, d: anchor }).replace(/view=mes&?/, '')} aria-current={view === k} className={`px-3 py-1.5 text-xs ${view === k ? 'bg-fg text-bg' : 'bg-surface'}`}>{l}</Link>)}</div>
        <form className="flex items-center gap-1" aria-label="Escolher mês e ano">
          {view !== 'mes' && <input type="hidden" name="view" value={view} />}
          {['pilar', 'campanha', 'etapa', 'formato', 'q'].map((k) => { const v = sp[k as keyof SP]; return v ? <input key={k} type="hidden" name={k} value={v} /> : null; })}
          <select name="mes" defaultValue={String(mo)} className="input !w-auto !py-1.5 text-xs" aria-label="Mês">{MONTHS_PT.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select>
          <select name="ano" defaultValue={String(y)} className="input !w-auto !py-1.5 text-xs" aria-label="Ano">{years.map((a) => <option key={a} value={a}>{a}</option>)}</select>
          <button className="btn btn-sm">Ir</button>
        </form>
        <div className="flex flex-wrap gap-1.5">{Object.keys(counts).sort().map((k) => <Link key={k} href={qs({ m: k, d: `${k}-01` })} className={`badge ${k === ym ? 'border-transparent bg-accent text-on-accent' : 'hover:bg-subtle'}`}>{MONTHS_PT[Number(k.slice(5)) - 1].slice(0, 3)} · {counts[k]}</Link>)}</div>
      </div>
      <form className="mb-5 flex flex-wrap items-center gap-2" aria-label="Filtros">
        <input type="hidden" name="m" value={ym} />{view !== 'mes' && <input type="hidden" name="view" value={view} />}{view === 'semana' && <input type="hidden" name="d" value={anchor} />}
        <input name="q" defaultValue={sp.q} placeholder="Buscar título, palavra-chave…" className="input !w-52 !py-1.5 text-xs" aria-label="Buscar" />
        <select name="pilar" defaultValue={sp.pilar ?? ''} className="input !w-auto !py-1.5 text-xs" aria-label="Pilar"><option value="">Todos os pilares</option>{pillars.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="campanha" defaultValue={sp.campanha ?? ''} className="input !w-auto !py-1.5 text-xs" aria-label="Campanha"><option value="">Todas as campanhas</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="etapa" defaultValue={sp.etapa ?? ''} className="input !w-auto !py-1.5 text-xs" aria-label="Status"><option value="">Todos os status</option>{STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <select name="formato" defaultValue={sp.formato ?? ''} className="input !w-auto !py-1.5 text-xs" aria-label="Formato"><option value="">Todos os formatos</option>{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn btn-sm">Filtrar</button>{(sp.q || sp.pilar || sp.campanha || sp.etapa || sp.formato) && <Link href={qs({ q: undefined, pilar: undefined, campanha: undefined, etapa: undefined, formato: undefined })} className="text-xs underline">Limpar</Link>}
      </form>
      <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted">{pillars.filter((p) => p.active).map((p) => <span key={p.id}><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: p.color }} />{p.name}</span>)}</div>

      {view === 'mes' && <CalendarMonth weeks={monthGridMon(y, mo)} posts={dated.map(toCal)} today={today} canEdit={open} newHref="/conteudo/novo" />}
      {view === 'semana' && (
        <div className="grid gap-3 md:grid-cols-7">{weekDays.map((d, i) => {
          const list = dated.filter((p) => p.publish_date === d);
          return (
            <section key={d} className={`rounded-2xl border p-3 ${d === today ? 'border-accent bg-accent/5' : 'border-line bg-surface'}`} aria-label={`${WD[i]} ${dateBR(d)}`}>
              <header className="mb-2"><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{WD[i].slice(0, 3)}</div><div className="text-lg font-semibold">{Number(d.slice(8))}<span className="ml-1 text-xs font-normal text-muted">{MONTHS_PT[Number(d.slice(5, 7)) - 1].slice(0, 3)}</span></div></header>
              <div className="space-y-2">{list.map((p) => (
                <Link key={p.id} href={`/conteudo/${p.id}`} className="block rounded-xl border border-line border-l-4 p-2.5 hover:bg-subtle/50" style={{ borderLeftColor: pm.get(p.pillar_id ?? '')?.color }}>
                  <div className="text-sm font-medium leading-snug">{p.title}</div>
                  <div className="mt-1 text-[11px] text-muted">{FORMATS[p.format] ?? p.format} · {NETWORKS[p.network]?.label ?? p.network}</div>
                  <div className="mt-1.5"><Badge tone={stageTone(p.status)}>{STAGE_LABEL[p.status]}</Badge></div>
                </Link>))}{!list.length && <p className="py-3 text-center text-xs text-muted">—</p>}</div>
            </section>);
        })}</div>
      )}
      {view === 'lista' && (
        !monthPosts.length ? <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">Nenhum conteúdo neste mês com os filtros atuais.</p> : (
          <div className="table-wrap"><table className="w-full">
            <thead><tr><th className="th">Data</th><th className="th">Conteúdo</th><th className="th">Pilar</th><th className="th">Formato</th><th className="th">Plataforma</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-line">{monthPosts.map((p) => (
              <tr key={p.id} className="hover:bg-subtle/50"><td className="td whitespace-nowrap text-muted">{dateBR(p.publish_date)}<div className="text-[11px]">{WD[(new Date(`${p.publish_date}T00:00:00Z`).getUTCDay() + 6) % 7]}</div></td>
                <td className="td"><Link href={`/conteudo/${p.id}`} className="font-medium hover:underline">{p.title}</Link>{p.keyword && <span className="ml-2 font-mono text-[11px] text-muted">{p.keyword}</span>}</td>
                <td className="td text-xs"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: pm.get(p.pillar_id ?? '')?.color }} />{pm.get(p.pillar_id ?? '')?.name ?? '—'}</td>
                <td className="td text-muted">{FORMATS[p.format] ?? p.format}</td><td className="td text-muted">{NETWORKS[p.network]?.label ?? p.network}</td><td className="td"><Badge tone={stageTone(p.status)}>{STAGE_LABEL[p.status]}</Badge></td></tr>))}</tbody></table></div>)
      )}
      {view === 'mes' && !monthPosts.length && <p className="mt-4 text-center text-sm text-muted">Nada com os filtros atuais neste mês.</p>}
      <p className="mt-4 text-xs text-muted">{monthPosts.length} conteúdo(s) em {MONTHS_PT[mo - 1]}. {open ? 'Arraste um conteúdo para outro dia para reagendar a data editorial.' : ''}</p>
    </>
  );
}
