import Link from 'next/link';
import { ChevronRight, FolderOpen, List } from 'lucide-react';
import { requireWorkspace } from '@/lib/session';
import { Empty, Field, PageHeader, Stat, Tabs } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { addProspect, quickSearch } from './actions';
import { placesConfigured } from '@/integrations/google-places';
import { AutoAnalyze } from './AutoAnalyze';
import { CONTACT_FILTERS, matchesContact, parseFilters, reachRank } from '@/lib/prospecting/filters';
import { groupCampaigns } from '@/lib/prospecting/groups';
import { searchQuota } from '@/lib/prospecting/quota';
import { PROSPECT_STATUS, SERVICE_LABEL } from '@/lib/prospecting/services';
import { ChannelBadges } from './ChannelBadges';
import { NicheField } from './NicheField';

export const metadata = { title: 'Prospecção' };
export const maxDuration = 60;
type SP = { tab?: string; status?: string; grp?: string; min?: string; q?: string; f?: string | string[]; ord?: string };
type Row = { id: string; name: string; category: string | null; website: string | null; email: string | null; phone: string | null; score: number | null; status: string; recommended_service: string | null; rating: number | null; reviews_count: number | null; campaign_id: string | null; site_numbers: string[] | null; email_src: string | null; linkedin: string | null; people: never[] | null; contacts: { email: string; kind: string }[] | null };

export default async function Prospeccao({ searchParams }: { searchParams: Promise<SP> }) {
  const { supabase, ws } = await requireWorkspace('prospeccao');
  const sp = await searchParams;
  const nav = (k: string) => `/prospeccao?tab=${k}`;
  const [{ data: campaigns }, { data: counts }, quota] = await Promise.all([
    supabase.from('prospect_campaigns').select('id, niche, city, created_at').eq('workspace_id', ws.id).order('created_at', { ascending: false }),
    supabase.from('prospects').select('status, campaign_id, score').eq('workspace_id', ws.id).limit(5000),
    searchQuota(supabase, ws.id),
  ]);
  const hasAny = (counts?.length ?? 0) > 0;
  const tab = ['prospectos', 'buscar', 'novo'].includes(sp.tab ?? '') ? sp.tab! : hasAny ? 'prospectos' : 'buscar';
  const groups = groupCampaigns(campaigns ?? []);
  const grp = sp.grp ?? '';
  const current = grp === 'todos' ? { title: 'Todos os prospectos' } : grp === 'manual' ? { title: 'Cadastrados manualmente' } : groups.get(grp) ? { title: `${groups.get(grp)!.niche} (${groups.get(grp)!.city})` } : null;
  const listMode = tab === 'prospectos' && !!current;

  let pendingCount = 0; let rows: Row[] = [];
  if (listMode) {
    let pcq = supabase.from('prospects').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).eq('status', 'novo').is('analyzed_at', null);
    if (grp === 'manual') pcq = pcq.is('campaign_id', null); else if (groups.get(grp)) pcq = pcq.in('campaign_id', groups.get(grp)!.ids);
    pendingCount = (await pcq).count ?? 0;
    let pq = supabase.from('prospects').select('id, name, category, website, email, phone, score, status, recommended_service, rating, reviews_count, campaign_id, site_numbers:analysis->site->whatsappNumbers, email_src:analysis->>email_source, linkedin:analysis->site->socials->>linkedin, people:analysis->site->people, contacts:analysis->site->contacts').eq('workspace_id', ws.id).order('score', { ascending: false, nullsFirst: false }).limit(500);
    if (sp.status && sp.status in PROSPECT_STATUS) pq = pq.eq('status', sp.status);
    if (grp === 'manual') pq = pq.is('campaign_id', null); else if (groups.get(grp)) pq = pq.in('campaign_id', groups.get(grp)!.ids);
    if (sp.min && Number(sp.min) > 0) pq = pq.gte('score', Number(sp.min));
    const qText = (sp.q ?? '').trim().replace(/[%,()]/g, ' ').slice(0, 60);
    if (qText) pq = pq.or(`name.ilike.%${qText}%,category.ilike.%${qText}%`);
    rows = ((await pq).data ?? []) as unknown as Row[];
  }
  const activeF = parseFilters(sp.f);
  let shown = rows.filter((r) => matchesContact(r as never, activeF));
  if (sp.ord === 'contato') shown = [...shown].sort((a, b) => reachRank(b as never) - reachRank(a as never) || (b.score ?? -1) - (a.score ?? -1));
  else if (sp.ord === 'nome') shown = [...shown].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const by = (s: string) => counts?.filter((c) => c.status === s).length ?? 0;
  const placesOk = placesConfigured();
  const quotaText = quota.max == null ? 'ilimitadas' : `${quota.used} de ${quota.max} usadas`;

  return (
    <>
      <PageHeader title="Prospecção" subtitle="Encontre empresas que precisam de design, veja a presença digital delas com dados públicos e leve as melhores para o CRM." />
      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Prospectos analisados" value={by('analisado')} hint={`${by('novo')} aguardando análise`} href={nav('prospectos')} />
        <Stat label="Contatados" value={by('contatado')} />
        <Stat label="Responderam" value={by('respondeu')} tone="ok" />
        <Stat label="Viraram lead" value={by('convertido')} href="/crm" />
      </section>
      <div className="card mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span>Busca no Google Maps: {placesOk ? <b>ativa</b> : <b className="text-warn">ainda não ativada</b>}</span>
        <span>Buscas do mês: <b>{quotaText}</b></span>
        <span className="text-muted">A análise usa só informações públicas dos sites. O OrbiaHUB não envia mensagens: você aborda cada empresa por conta própria.</span>
      </div>
      <Tabs current={tab} items={[{ key: 'prospectos', label: 'Prospectos', href: nav('prospectos') }, { key: 'buscar', label: 'Buscar no Google Maps', href: nav('buscar') }, { key: 'novo', label: 'Cadastrar manualmente', href: nav('novo') }]} />

      {tab === 'buscar' && (
        <form action={quickSearch} className="card !p-4" role="search" aria-label="Buscar prospectos">
          <NicheField>
            <label className="block"><span className="label">Cidade</span><input name="city" required minLength={2} maxLength={80} className="input" placeholder="ex.: Curitiba" /></label>
            <SubmitButton className="btn btn-primary w-full md:w-auto" pendingText="Buscando…">Buscar prospectos</SubmitButton>
          </NicheField>
          <p className="mt-3 text-xs text-muted">Cada tipo de nicho conta como 1 busca na cota do mês. Busca empresas no Google Maps, analisa o site de cada uma e agrupa os resultados por nicho e cidade.{!placesOk && ' A busca ainda não foi ativada nesta instalação; até lá, use “Cadastrar manualmente”.'}</p>
        </form>
      )}

      {tab === 'novo' && (
        <form action={addProspect} className="card grid max-w-3xl gap-4 sm:grid-cols-2">
          <Field label="Nome da empresa" className="sm:col-span-2"><input name="name" required minLength={2} maxLength={160} className="input" /></Field>
          <Field label="Site"><input name="website" className="input" placeholder="empresa.com.br" /></Field>
          <Field label="Categoria"><input name="category" className="input" placeholder="ex.: clínica odontológica" /></Field>
          <Field label="E-mail"><input name="email" type="email" className="input" /></Field>
          <Field label="Telefone / WhatsApp"><input name="phone" className="input" /></Field>
          <Field label="Endereço" className="sm:col-span-2"><input name="address" className="input" /></Field>
          <Field label="Anotações" className="sm:col-span-2"><textarea name="notes" rows={3} className="input" /></Field>
          <div className="sm:col-span-2"><SubmitButton pendingText="Analisando…">Cadastrar e analisar</SubmitButton></div>
        </form>
      )}

      {tab === 'prospectos' && !listMode && (() => {
        const boxes = [...groups.values()].sort((x, y) => y.latest.localeCompare(x.latest)).map((g) => ({ href: `/prospeccao?tab=prospectos&grp=${g.key}`, title: `${g.niche} (${g.city})`, sub: `${g.ids.length} busca(s)`, rows: counts?.filter((c) => c.campaign_id && g.ids.includes(c.campaign_id)) ?? [] }));
        const manual = counts?.filter((c) => c.campaign_id == null) ?? [];
        if (manual.length) boxes.push({ href: '/prospeccao?tab=prospectos&grp=manual', title: 'Cadastrados manualmente', sub: 'sem busca', rows: manual });
        if (!boxes.length) return <Empty title="Nenhum prospecto ainda" text="Busque empresas por nicho e cidade no Google Maps ou cadastre um prospecto manualmente. Os resultados ficam agrupados em caixas por nicho e cidade." action={<Link href={nav('buscar')} className="btn btn-primary">Buscar prospectos</Link>} />;
        return (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted">{boxes.length} grupo(s) de nicho e cidade. Clique em um para ver os prospectos.</p><Link href="/prospeccao?tab=prospectos&grp=todos" className="btn btn-sm"><List className="h-4 w-4" strokeWidth={1.6} />Ver todos em uma lista</Link></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{boxes.map((b) => {
              const n = (st: string[]) => b.rows.filter((r) => st.includes(r.status)).length;
              const scores = b.rows.map((r) => r.score).filter((v): v is number => typeof v === 'number');
              const avg = scores.length ? Math.round(scores.reduce((a, v) => a + v, 0) / scores.length) : null, best = scores.length ? Math.max(...scores) : null;
              return (
                <Link key={b.href} href={b.href} className="card group block !p-5 transition hover:border-accent">
                  <div className="flex items-start justify-between gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-ink"><FolderOpen className="h-5 w-5" strokeWidth={1.7} /></span><ChevronRight className="h-5 w-5 text-muted transition group-hover:translate-x-0.5" strokeWidth={1.7} /></div>
                  <div className="mt-4 font-semibold leading-snug">{b.title}</div><div className="text-xs text-muted">{b.sub}</div>
                  <div className="mt-4 text-3xl font-semibold tracking-tight">{b.rows.length}<span className="ml-1.5 text-sm font-normal text-muted">prospecto(s)</span></div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]"><span className="badge">{n(['novo'])} novos</span><span className="badge">{n(['analisado'])} analisados</span><span className="badge">{n(['contatado'])} contatados</span>{n(['convertido']) > 0 && <span className="badge bg-ok/15 text-ok">{n(['convertido'])} leads</span>}</div>
                  {avg != null && <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-muted"><span>Oportunidade média <b className="text-fg">{avg}/100</b></span><span>melhor <b className="text-fg">{best}</b></span></div>}
                </Link>);
            })}</div>
          </>);
      })()}

      {tab === 'prospectos' && listMode && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{current!.title}</h2><Link href={nav('prospectos')} className="btn btn-sm">← Todos os grupos</Link></div>
          <AutoAnalyze grp={grp} pending={pendingCount} />
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="prospectos" /><input type="hidden" name="grp" value={grp} />
            <input name="q" defaultValue={sp.q} placeholder="Buscar por nome ou categoria" className="input max-w-xs" />
            <select name="status" defaultValue={sp.status ?? ''} className="input w-auto"><option value="">Todos os status</option>{Object.entries(PROSPECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
            <select name="min" defaultValue={sp.min ?? ''} className="input w-auto"><option value="">Qualquer pontuação</option><option value="40">40+</option><option value="60">60+</option><option value="75">75+</option></select>
            <select name="ord" defaultValue={sp.ord ?? ''} className="input w-auto"><option value="">Maior oportunidade</option><option value="contato">Mais fácil de abordar</option><option value="nome">Nome</option></select>
            <button className="btn">Filtrar</button>
            <details className="w-full text-sm"><summary className="cursor-pointer text-muted">Filtrar por canais de contato</summary>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{CONTACT_FILTERS.map((f) => <label key={f.key} className="flex items-center gap-2"><input type="checkbox" name="f" value={f.key} defaultChecked={activeF.includes(f.key)} />{f.label}</label>)}</div></details>
          </form>
          {!shown.length ? <Empty title="Nenhum prospecto com esses filtros" text="Ajuste ou limpe os filtros." /> : (
            <div className="table-wrap"><table className="w-full">
              <thead><tr><th className="th">Empresa</th><th className="th">Pontuação</th><th className="th">Serviço sugerido</th><th className="th">Contato</th><th className="th">Status</th></tr></thead>
              <tbody className="divide-y divide-line">{shown.map((r) => {
                const st = PROSPECT_STATUS[r.status] ?? PROSPECT_STATUS.novo;
                return (
                  <tr key={r.id} className="align-top hover:bg-subtle/50">
                    <td className="td"><Link href={`/prospeccao/${r.id}`} className="font-medium hover:underline">{r.name}</Link><div className="text-xs text-muted">{r.category ?? '—'}{r.rating ? ` · ${String(r.rating).replace('.', ',')} ★ (${r.reviews_count ?? 0})` : ''}</div></td>
                    <td className="td font-semibold">{r.score ?? '—'}</td>
                    <td className="td text-muted">{r.recommended_service ? SERVICE_LABEL[r.recommended_service as keyof typeof SERVICE_LABEL] ?? '—' : '—'}</td>
                    <td className="td"><ChannelBadges email={r.email} emailFromSite={r.email_src === 'site'} phone={r.phone} siteNumbers={r.site_numbers} linkedin={r.linkedin} people={r.people} analyzed={r.score != null} /></td>
                    <td className="td"><span className={`badge ${st.tone}`}>{st.label}</span></td>
                  </tr>);
              })}</tbody></table></div>)}
        </>
      )}
    </>
  );
}
