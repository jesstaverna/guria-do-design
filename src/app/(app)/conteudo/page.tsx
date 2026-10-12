import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { Empty, PageHeader, Section, Stat } from '@/components/ui';
import { ProgressBar } from '@/components/Charts';
import { STAGES, contentStats } from '@/lib/content';
import { MONTHS_PT, addDays, todayBR } from '@/lib/domain';
import { dateBR, dateTimeBR, num, pct } from '@/lib/format';

export const metadata = { title: 'Planejamento de conteúdo' };

const KIND: Record<string, string> = { criado: 'Criado', importado: 'Importado', status: 'Mudou de etapa', reagendado: 'Reagendado', editado: 'Editado', publicado: 'Publicado' };

export default async function ConteudoOverview() {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const { posts, pillars, campaigns, links } = await loadContent(supabase, ws.id);
  const s = contentStats(posts, pillars);
  const today = todayBR();
  const next = posts.filter((p) => p.bucket === 'calendario' && p.publish_date && p.publish_date >= today && p.publish_date <= addDays(today, 7) && p.status !== 'publicado').slice(0, 8);
  const pn = new Map(pillars.map((p) => [p.id, p]));
  const { data: events } = await supabase.from('content_post_events').select('id, kind, created_at, post_id, detail').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(8);
  const title = new Map(posts.map((p) => [p.id, p.title]));
  const months = Object.keys(s.perMonth).sort();
  const maxStage = Math.max(1, ...Object.values(s.byStage));

  if (!posts.length) {
    return (<><PageHeader title="Planejamento de conteúdo" subtitle="Pilares, calendário editorial e Kanban de produção usando os mesmos registros." /><Empty title="Nenhum conteúdo ainda" text="Crie um conteúdo ou importe o planejamento (somente administradores)." action={open && <div className="flex justify-center gap-2"><Link href="/conteudo/novo" className="btn btn-primary">Novo conteúdo</Link><Link href="/conteudo/importar" className="btn">Importar planejamento</Link></div>} /></>);
  }
  return (
    <>
      <PageHeader title="Planejamento de conteúdo" subtitle="Um só conjunto de registros alimenta pilares, calendário e Kanban. A data é do planejamento editorial: não agenda nada em rede social." actions={open && <Link href="/conteudo/novo" className="btn btn-primary">Novo conteúdo</Link>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Planejados com data" value={num(s.planned)} tone="accent" hint={months.map((m) => `${MONTHS_PT[Number(m.slice(5)) - 1].slice(0, 3)} ${s.perMonth[m]}`).join(' · ')} href="/conteudo/calendario" />
        <Stat label="Publicados (confirmados)" value={num(s.published)} tone={s.published ? 'ok' : undefined} hint="com data e confirmação reais" href="/conteudo/kanban" />
        <Stat label="Pendentes" value={num(s.pending)} hint="planejados ainda não publicados" />
        <Stat label="Acervo e ideias sem data" value={num(s.reserve.acervo + s.reserve.remanejado + s.reserve.ideia)} hint={`${s.reserve.acervo} acervo · ${s.reserve.remanejado} remanejados · ${s.reserve.ideia} ideias`} href="/conteudo/acervo" />
      </div>
      <Section title="Progresso do planejamento"><div className="mb-2 flex justify-between text-sm"><span>{s.published} de {s.planned} publicados</span><span className="text-muted">{pct(s.progress)}</span></div><ProgressBar value={s.progress} /><p className="mt-2 text-xs text-muted">Só conta como publicado o que tem data/hora real de publicação confirmada. Alcance e conversão não são medidos aqui.</p></Section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Por pilar" actions={<Link href="/conteudo/pilares" className="text-xs underline">Gerenciar pilares</Link>}>
          <ul className="space-y-4">{s.byPillar.map((b) => { const pl = pn.get(b.id)!; return (
            <li key={b.id}><div className="mb-1 flex justify-between text-sm"><span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: pl.color }} />{pl.name}</span><span className="text-muted">{b.withDate} com data · {b.published} publ. · {b.total} no total</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full" style={{ width: `${s.planned ? (b.withDate / s.planned) * 100 : 0}%`, background: pl.color }} /></div></li>); })}
            {s.noPillar > 0 && <li className="text-xs text-warn">{s.noPillar} conteúdo(s) com data sem pilar.</li>}</ul>
        </Section>
        <Section title="Por etapa de produção" actions={<Link href="/conteudo/kanban" className="text-xs underline">Abrir Kanban</Link>}>
          <ul className="space-y-3">{STAGES.map((st) => (<li key={st.key}><div className="mb-1 flex justify-between text-sm"><span>{st.label}</span><span className="text-muted">{s.byStage[st.key]}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-subtle"><div className="h-full rounded-full bg-accent" style={{ width: `${(s.byStage[st.key] / maxStage) * 100}%` }} /></div></li>))}</ul>
        </Section>
        <Section title="Próximos 7 dias (editorial)" actions={<Link href="/conteudo/calendario" className="text-xs underline">Calendário</Link>}>
          {!next.length ? <p className="text-sm text-muted">Nada planejado para os próximos 7 dias.</p> : <ul className="space-y-2 text-sm">{next.map((p) => <li key={p.id} className="flex justify-between gap-3"><Link href={`/conteudo/${p.id}`} className="hover:underline"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: pn.get(p.pillar_id ?? '')?.color ?? '#999' }} />{p.title}</Link><span className="shrink-0 text-muted">{dateBR(p.publish_date)}</span></li>)}</ul>}
        </Section>
        <Section title="Atividade recente">
          {!events?.length ? <p className="text-sm text-muted">Sem atividade ainda.</p> : <ul className="space-y-2 text-sm">{events.map((e) => <li key={e.id} className="flex justify-between gap-3"><span><b className="font-medium">{KIND[e.kind] ?? e.kind}</b> · <Link href={`/conteudo/${e.post_id}`} className="hover:underline">{title.get(e.post_id) ?? 'conteúdo'}</Link></span><span className="shrink-0 text-xs text-muted">{dateTimeBR(e.created_at)}</span></li>)}</ul>}
        </Section>
      </div>
      <p className="mt-6 text-xs text-muted">{campaigns.length} campanha(s) · {links.size} conteúdo(s) com campanha.</p>
    </>
  );
}
