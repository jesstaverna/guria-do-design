import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Field, PageHeader, Section, Stat } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { PrintButton } from '@/components/ClientButtons';
import { LineChart } from '@/components/Charts';
import { CampaignForm } from '@/components/CampaignForm';
import { AD_PLATFORMS, addDays, adKpis, sumAd, todayBR } from '@/lib/domain';
import { dateBR, money, num, pct } from '@/lib/format';
import { deleteMetric, importCsv, saveMetric, updateCampaign } from '../actions';

export const metadata = { title: 'Campanha' };

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ d?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const days = [7, 14, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : 30;
  const { supabase, ws, open } = await requireWorkspace('trafego');
  const { data: c } = await supabase.from('ad_campaigns').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!c) notFound();
  const from = addDays(todayBR(), -(days - 1));
  const [{ data: rows }, { data: clients }] = await Promise.all([
    supabase.from('ad_metrics_daily').select('*').eq('campaign_id', id).gte('day', from).order('day'),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
  ]);
  const t = sumAd(rows ?? []), k = adKpis(t);
  const clientName = clients?.find((x) => x.id === c.client_id)?.name;
  const over = c.target_cpl_cents != null && k.cpl != null && k.cpl > c.target_cpl_cents;

  return (
    <>
      <PageHeader title={c.name} subtitle={`${AD_PLATFORMS[c.platform]} · ${clientName ?? 'Próprio'} · ${c.status}`} actions={<><div className="flex gap-1">{[7, 14, 30, 90].map((d) => <a key={d} href={`/trafego/${id}?d=${d}`} className={`btn btn-sm ${d === days ? 'btn-dark' : ''}`}>{d}d</a>)}</div><PrintButton label="Relatório PDF" /></>} />
      {over && <p className="mb-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">CPL de {money(k.cpl)} acima da meta de {money(c.target_cpl_cents)}. Revise criativos, público e oferta.</p>}
      <div className="mb-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Investimento" value={money(t.spend_cents)} /><Stat label="Impressões" value={num(t.impressions)} hint={k.cpm != null ? `CPM ${money(k.cpm)}` : undefined} /><Stat label="Cliques" value={num(t.clicks)} hint={k.ctr != null ? `CTR ${pct(k.ctr)}` : undefined} />
        <Stat label="Leads" value={num(t.leads)} hint={k.cpl != null ? `CPL ${money(k.cpl)}` : undefined} tone={over ? 'danger' : undefined} /><Stat label="Conversões" value={num(t.conversions)} hint={k.cpa != null ? `CPA ${money(k.cpa)}` : undefined} /><Stat label="ROAS" value={k.roas != null ? `${k.roas.toFixed(2).replace('.', ',')}x` : '—'} hint={t.revenue_cents ? money(t.revenue_cents) : undefined} />
      </div>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title="Investimento por dia"><LineChart label="Investimento diário" points={(rows ?? []).map((r) => ({ x: dateBR(r.day).slice(0, 5), y: r.spend_cents }))} format={(v) => money(v)} /></Section>
        <Section title="Leads por dia"><LineChart label="Leads diários" points={(rows ?? []).map((r) => ({ x: dateBR(r.day).slice(0, 5), y: Number(r.leads) }))} /></Section>
      </div>
      {open && (
        <div className="no-print mb-6 grid gap-6 lg:grid-cols-2">
          <Section title="Lançar métricas do dia">
            <form action={saveMetric.bind(null, id)} className="grid grid-cols-2 gap-3">
              <Field label="Data"><input name="day" type="date" required defaultValue={todayBR()} max={todayBR()} className="input" /></Field><Field label="Investimento (R$)"><input name="spend" inputMode="decimal" required className="input" /></Field>
              <Field label="Impressões"><input name="impressions" inputMode="numeric" className="input" /></Field><Field label="Cliques"><input name="clicks" inputMode="numeric" className="input" /></Field>
              <Field label="Leads"><input name="leads" inputMode="numeric" className="input" /></Field><Field label="Conversões/vendas"><input name="conversions" inputMode="numeric" className="input" /></Field>
              <Field label="Receita gerada (R$)" className="col-span-2"><input name="revenue" inputMode="decimal" className="input" /></Field>
              <div className="col-span-2"><SubmitButton pendingText="…">Salvar dia</SubmitButton><span className="ml-3 text-xs text-muted">Salvar de novo na mesma data substitui os valores.</span></div>
            </form>
          </Section>
          <Section title="Importar CSV">
            <form action={importCsv.bind(null, id)} className="space-y-3">
              <textarea name="csv" rows={7} required className="input font-mono !text-xs" placeholder={'Data;Gasto;Impressões;Cliques;Leads\n01/10/2026;85,40;12000;310;9'} />
              <p className="text-xs text-muted">Cole o relatório exportado do gerenciador. Cabeçalhos reconhecidos: Data, Gasto/Investimento, Impressões, Cliques, Leads, Conversões, Receita. Separador ; , ou tab.</p>
              <SubmitButton pendingText="Importando…">Importar</SubmitButton>
            </form>
          </Section>
        </div>
      )}
      <Section title={`Registros diários (${rows?.length ?? 0})`}>
        {!rows?.length ? <p className="text-sm text-muted">Sem métricas no período.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="th">Dia</th><th className="th text-right">Invest.</th><th className="th text-right">Impr.</th><th className="th text-right">Cliques</th><th className="th text-right">Leads</th><th className="th text-right">CPL</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">{[...rows].reverse().map((r) => (<tr key={r.id}><td className="td">{dateBR(r.day)}</td><td className="td text-right">{money(r.spend_cents)}</td><td className="td text-right">{num(r.impressions)}</td><td className="td text-right">{num(r.clicks)}</td><td className="td text-right">{num(r.leads)}</td><td className="td text-right">{r.leads > 0 ? money(r.spend_cents / r.leads) : '—'}</td>
              <td className="td no-print text-right">{open && <form action={deleteMetric.bind(null, id, r.id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover este dia?">Remover</SubmitButton></form>}</td></tr>))}</tbody></table></div>
        )}
      </Section>
      <details className="no-print card mt-6 !p-4"><summary className="cursor-pointer text-sm font-medium">Editar campanha</summary><div className="mt-4"><fieldset disabled={!open}><CampaignForm action={updateCampaign.bind(null, id)} c={c} clients={clients ?? []} /></fieldset></div></details>
    </>
  );
}
