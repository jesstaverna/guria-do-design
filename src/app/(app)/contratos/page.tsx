import Link from 'next/link';
import { requireWorkspace } from '@/lib/session';
import { Badge, Empty, PageHeader } from '@/components/ui';
import { CONTRACT_STATUS } from '@/lib/domain';
import { dateBR, dateTimeBR, money } from '@/lib/format';

export const metadata = { title: 'Contratos' };

export default async function Contratos() {
  const { supabase, ws, open } = await requireWorkspace('contratos');
  const { data } = await supabase.from('contracts').select('id, number, title, status, value_cents, start_date, signed_at, client:clients(name)').eq('workspace_id', ws.id).order('number', { ascending: false }).limit(300);
  return (
    <>
      <PageHeader title="Contratos" subtitle="Gere o contrato a partir da proposta e colete o aceite eletrônico por link." actions={<>
        <Link href="/contratos/modelos" className="btn">Meus modelos</Link>{open && <Link href="/contratos/novo" className="btn btn-primary">Novo contrato</Link>}</>} />
      <p className="mb-5 rounded-xl border border-line bg-subtle/50 p-3 text-xs text-muted">Os modelos são um ponto de partida e não substituem a revisão de um advogado. O aceite por link é uma assinatura eletrônica simples (nome, documento, data/hora, IP e hash do texto); para exigir certificado ICP-Brasil ou assinatura avançada, use um serviço como Clicksign ou ZapSign.</p>
      {!data?.length ? <Empty title="Nenhum contrato ainda" text="Aceitou uma proposta? Gere o contrato em poucos cliques." action={open && <Link href="/contratos/novo" className="btn btn-primary">Gerar contrato</Link>} /> : (
        <div className="table-wrap"><table className="w-full">
          <thead><tr><th className="th">Nº</th><th className="th">Contrato</th><th className="th">Cliente</th><th className="th">Valor</th><th className="th">Assinatura</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-line">{data.map((c) => (
            <tr key={c.id} className="hover:bg-subtle/50"><td className="td text-muted">#{c.number}</td><td className="td"><Link href={`/contratos/${c.id}`} className="font-medium hover:underline">{c.title}</Link></td>
              <td className="td text-muted">{(c.client as unknown as { name: string } | null)?.name ?? '—'}</td><td className="td">{money(c.value_cents)}</td><td className="td text-muted">{c.signed_at ? dateTimeBR(c.signed_at) : `início ${dateBR(c.start_date)}`}</td>
              <td className="td"><Badge tone={CONTRACT_STATUS[c.status]?.tone}>{CONTRACT_STATUS[c.status]?.label}</Badge></td></tr>))}</tbody>
        </table></div>
      )}
    </>
  );
}
