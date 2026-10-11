import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, Field, MonthNav, PageHeader, Section, Tabs } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { AutoSelect } from '@/components/AutoSelect';
import { FORMATS, MONTHS_PT, NETWORKS, POST_STATUS, monthGrid, pad2, todayBR } from '@/lib/domain';
import { dateBR } from '@/lib/format';
import { createPillar, deletePillar, setPostStatus } from './actions';

export const metadata = { title: 'Conteúdo' };

export default async function Conteudo({ searchParams }: { searchParams: Promise<{ view?: string; m?: string; network?: string; client?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const sp = await searchParams;
  const view = ['calendario', 'quadro', 'pilares'].includes(sp.view ?? '') ? sp.view! : 'calendario';
  const today = todayBR();
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.m ?? '') ? sp.m! : today.slice(0, 7);
  const [y, mo] = ym.split('-').map(Number);
  const weeks = monthGrid(y, mo);
  const from = weeks[0][0].date, to = weeks[weeks.length - 1][6].date;

  let q = supabase.from('content_posts').select('id, title, network, format, status, publish_date, client_id').eq('workspace_id', ws.id).limit(1000);
  if (view === 'calendario') q = q.gte('publish_date', from).lte('publish_date', to);
  else if (view === 'quadro') q = q.or(`status.neq.publicado,publish_date.gte.${today}`).order('publish_date', { nullsFirst: false });
  if (sp.network) q = q.eq('network', sp.network);
  if (sp.client === 'proprio') q = q.is('client_id', null);
  else if (sp.client && /^[0-9a-f-]{36}$/i.test(sp.client)) q = q.eq('client_id', sp.client);
  const [{ data: posts }, { data: clients }, { data: pillars }] = await Promise.all([
    q,
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('content_pillars').select('id, name, description, client_id').eq('workspace_id', ws.id).order('name'),
  ]);
  const cn = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const extra = `${sp.network ? `&network=${sp.network}` : ''}${sp.client ? `&client=${sp.client}` : ''}`;
  const tab = (k: string, label: string) => ({ key: k, label, href: `/conteudo?view=${k}${extra}${k === 'calendario' ? `&m=${ym}` : ''}` });
  const perNet = new Map<string, number>();
  (posts ?? []).forEach((p) => perNet.set(p.network, (perNet.get(p.network) ?? 0) + 1));
  const byDay = new Map<string, NonNullable<typeof posts>>();
  (posts ?? []).forEach((p) => p.publish_date && byDay.set(p.publish_date, [...(byDay.get(p.publish_date) ?? []), p]));

  return (
    <>
      <PageHeader title="Planejamento de conteúdo" subtitle="Calendário editorial por rede social, do rascunho à publicação." actions={open && <Link href="/conteudo/novo" className="btn btn-primary">Novo conteúdo</Link>} />
      <Tabs current={view} items={[tab('calendario', 'Calendário'), tab('quadro', 'Quadro por etapa'), tab('pilares', 'Pilares de conteúdo')]} />

      {view !== 'pilares' && (
        <form className="mb-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="m" value={ym} />
          <select name="network" defaultValue={sp.network ?? ''} className="input w-auto"><option value="">Todas as redes</option>{Object.entries(NETWORKS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <select name="client" defaultValue={sp.client ?? ''} className="input w-auto"><option value="">Todos os perfis</option><option value="proprio">Próprios</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="btn">Filtrar</button>
          {view === 'calendario' && <div className="ml-auto"><MonthNav base="/conteudo" ym={ym} label={`${MONTHS_PT[mo - 1]} ${y}`} extra={`&view=calendario${extra}`} /></div>}
        </form>
      )}

      {view === 'calendario' && (<>
        <div className="mb-4 flex flex-wrap gap-2 text-xs">{Object.entries(NETWORKS).filter(([k]) => perNet.has(k)).map(([k, v]) => <span key={k} className="badge"><i className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: v.color }} />{v.label}: {perNet.get(k)}</span>)}</div>
        <div className="overflow-x-auto"><div className="min-w-[760px] overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="grid grid-cols-7 border-b border-line bg-subtle/50 text-center text-xs font-medium uppercase tracking-wider text-muted">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          {weeks.map((w, wi) => (
            <div key={wi} className="grid grid-cols-7 divide-x divide-line border-b border-line last:border-b-0">
              {w.map((c) => (
                <div key={c.date} className={`min-h-28 p-1.5 ${c.inMonth ? '' : 'bg-subtle/40'} ${c.date === today ? 'bg-accent/5' : ''}`}>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">{open && c.inMonth ? <Link href={`/conteudo/novo?date=${c.date}${sp.network ? `&network=${sp.network}` : ''}`} className="opacity-0 hover:opacity-100 focus:opacity-100" aria-label={`Novo conteúdo em ${dateBR(c.date)}`}>+</Link> : <span />}<span className={c.date === today ? 'font-bold text-accent-ink' : ''}>{pad2(Number(c.date.slice(8)))}</span></div>
                  <div className="space-y-1">{(byDay.get(c.date) ?? []).map((p) => (
                    <Link key={p.id} href={`/conteudo/${p.id}`} title={`${NETWORKS[p.network]?.label} · ${FORMATS[p.format]} · ${p.title}`} className={`block truncate rounded border-l-4 bg-subtle px-1.5 py-0.5 text-[11px] ${p.status === 'publicado' ? 'opacity-60' : ''}`} style={{ borderColor: NETWORKS[p.network]?.color }}>{p.title}</Link>))}</div>
                </div>
              ))}
            </div>
          ))}
        </div></div>
        {!posts?.length && <p className="mt-4 text-center text-sm text-muted">Nada planejado neste mês. Passe o mouse sobre um dia e clique em “+”.</p>}
      </>)}

      {view === 'quadro' && (!posts?.length ? <Empty title="Nenhum conteúdo no quadro" text="Anote ideias e mova pelas etapas até publicar." action={open && <Link href="/conteudo/novo" className="btn btn-primary">Criar conteúdo</Link>} /> : (
        <div className="flex gap-4 overflow-x-auto pb-4">{POST_STATUS.map((s) => {
          const items = posts.filter((p) => p.status === s.key);
          return (
            <section key={s.key} className="w-72 shrink-0 rounded-2xl border border-line bg-subtle/50 p-3">
              <header className="mb-3 flex justify-between px-1.5"><h3 className="text-sm font-semibold">{s.label}</h3><span className="text-xs text-muted">{items.length}</span></header>
              <div className="space-y-2.5">{items.map((p) => (
                <article key={p.id} className="rounded-xl border border-line border-l-4 bg-surface p-3" style={{ borderLeftColor: NETWORKS[p.network]?.color }}>
                  <Link href={`/conteudo/${p.id}`} className="text-sm font-medium hover:underline">{p.title}</Link>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted"><span>{NETWORKS[p.network]?.label} · {FORMATS[p.format]}</span>{p.publish_date && <span>{dateBR(p.publish_date)}</span>}{p.client_id && <span>{cn.get(p.client_id)}</span>}</div>
                  {open && <div className="mt-2"><AutoSelect action={setPostStatus.bind(null, p.id)} defaultValue={p.status} label={`Etapa de ${p.title}`} options={POST_STATUS.map((x) => ({ value: x.key, label: x.label }))} /></div>}
                </article>))}</div>
            </section>
          );
        })}</div>
      ))}

      {view === 'pilares' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {!pillars?.length ? <Empty title="Defina seus pilares" text="Pilares são os 3–5 temas que sustentam sua comunicação (ex.: educação, bastidores, prova, oferta). Cada post deve pertencer a um." /> : pillars.map((p) => (
              <div key={p.id} className="card flex items-start justify-between gap-4 !p-4"><div><div className="font-medium">{p.name} {p.client_id && <Badge>{cn.get(p.client_id)}</Badge>}</div>{p.description && <p className="mt-1 text-sm text-muted">{p.description}</p>}</div>
                {open && <form action={deletePillar.bind(null, p.id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover pilar? Os posts continuam, sem pilar.">Remover</SubmitButton></form>}</div>))}
          </div>
          {open && <Section title="Novo pilar"><form action={createPillar} className="space-y-3"><Field label="Nome"><input name="name" required className="input" /></Field><Field label="Descrição"><textarea name="description" rows={3} className="input" /></Field><Field label="Cliente (opcional)"><select name="client_id" className="input"><option value="">— Próprio —</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><SubmitButton pendingText="…">Criar pilar</SubmitButton></form></Section>}
        </div>
      )}
    </>
  );
}
