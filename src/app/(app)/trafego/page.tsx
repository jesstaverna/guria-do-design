import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, PageHeader, Stat } from '@/components/ui';
import { CampaignForm } from '@/components/CampaignForm';
import { AD_PLATFORMS, addDays, adKpis, sumAd, todayBR, type AdTotals } from '@/lib/domain';
import { money, num, pct } from '@/lib/format';
import { createCampaign } from './actions';

export const metadata = { title: 'Tráfego pago' };

export default async function Trafego({ searchParams }: { searchParams: Promise<{ d?: string; client?: string }> }) {
  const { supabase, ws, open } = await requireWorkspace('trafego');
  const sp = await searchParams;
  const days = [7, 14, 30, 90].includes(Number(sp.d)) ? Number(sp.d) : 30;
  const from = addDays(todayBR(), -(days - 1));
  let cq = supabase.from('ad_campaigns').select('id, name, platform, status, client_id, target_cpl_cents, daily_budget_cents').eq('workspace_id', ws.id).order('status').order('name');
  if (sp.client && /^[0-9a-f-]{36}$/i.test(sp.client)) cq = cq.eq('client_id', sp.client);
  const [{ data: camps }, { data: metrics }, { data: clients }] = await Promise.all([
    cq,
    supabase.from('ad_metrics_daily').select('campaign_id, spend_cents, impressions, clicks, leads, conversions, revenue_cents').eq('workspace_id', ws.id).gte('day', from).limit(20000),
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
  ]);
  const cn = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const per = new Map<string, AdTotals>();
  const ids = new Set((camps ?? []).map((c) => c.id));
  (metrics ?? []).filter((m) => ids.has(m.campaign_id)).forEach((m) => per.set(m.campaign_id, sumAd([per.get(m.campaign_id) ?? {}, m])));
  const total = sumAd([...per.values()]);
  const k = adKpis(total);

  return (
    <>
      <PageHeader title="Tráfego pago" subtitle="Campanhas, investimento e resultado por cliente. Métricas por lançamento manual ou CSV." actions={<div className="flex gap-1">{[7, 14, 30, 90].map((d) => <Link key={d} href={`/trafego?d=${d}${sp.client ? `&client=${sp.client}` : ''}`} className={`btn btn-sm ${d === days ? 'btn-dark' : ''}`}>{d}d</Link>)}</div>} />
      <form className="mb-5 flex gap-2"><input type="hidden" name="d" value={days} /><select name="client" defaultValue={sp.client ?? ''} className="input w-auto"><option value="">Todos os clientes</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="btn">Filtrar</button></form>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Investimento" value={money(total.spend_cents)} hint={`últimos ${days} dias`} />
        <Stat label="Leads" value={num(total.leads)} />
        <Stat label="CPL médio" value={k.cpl != null ? money(k.cpl) : '—'} />
        <Stat label="CTR" value={k.ctr != null ? pct(k.ctr) : '—'} hint={k.cpc != null ? `CPC ${money(k.cpc)}` : undefined} />
        <Stat label="ROAS" value={k.roas != null ? `${k.roas.toFixed(2).replace('.', ',')}x` : '—'} hint={total.revenue_cents ? `receita ${money(total.revenue_cents)}` : 'informe a receita para calcular'} />
      </div>
      {!camps?.length ? <Empty title="Nenhuma campanha" text="Cadastre campanhas do Meta Ads, Google Ads e outras para acompanhar investimento, CPL e ROAS." /> : (
        <div className="table-wrap mb-8"><table className="w-full">
          <thead><tr><th className="th">Campanha</th><th className="th">Cliente</th><th className="th text-right">Invest.</th><th className="th text-right">Leads</th><th className="th text-right">CPL</th><th className="th text-right">CTR</th><th className="th text-right">ROAS</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{camps.map((c) => {
            const t = per.get(c.id) ?? sumAd([]); const kk = adKpis(t);
            const over = c.target_cpl_cents != null && kk.cpl != null && kk.cpl > c.target_cpl_cents;
            return (<tr key={c.id} className="hover:bg-subtle/50">
              <td className="td"><Link href={`/trafego/${c.id}`} className="font-medium hover:underline">{c.name}</Link><div className="text-xs text-muted">{AD_PLATFORMS[c.platform]}</div></td>
              <td className="td text-muted">{c.client_id ? cn.get(c.client_id) : 'Próprio'}</td>
              <td className="td text-right">{money(t.spend_cents)}</td><td className="td text-right">{num(t.leads)}</td>
              <td className={`td text-right ${over ? 'font-medium text-danger' : ''}`}>{kk.cpl != null ? money(kk.cpl) : '—'}{over && <div className="text-[11px]">meta {money(c.target_cpl_cents)}</div>}</td>
              <td className="td text-right">{kk.ctr != null ? pct(kk.ctr) : '—'}</td><td className="td text-right">{kk.roas != null ? `${kk.roas.toFixed(2).replace('.', ',')}x` : '—'}</td>
              <td className="td"><Badge tone={c.status === 'ativa' ? 'bg-ok/15 text-ok' : undefined}>{c.status}</Badge></td></tr>);
          })}</tbody>
        </table></div>
      )}
      {open && <details className="card !p-4"><summary className="cursor-pointer text-sm font-medium">+ Nova campanha</summary><div className="mt-4"><CampaignForm action={createCampaign} clients={clients ?? []} label="Criar campanha" defaultClient={sp.client} /></div></details>}
      <p className="mt-6 text-xs text-muted">{'A integração direta com Meta Ads e Google Ads (sincronização automática) depende de aprovação de app/tokens por cliente e está documentada como fase seguinte; até lá, lance os números ou importe o CSV exportado da plataforma.'}</p>
    </>
  );
}
