import { requireWorkspace, trialDaysLeft } from '@/lib/session';
import { Badge, PageHeader, Section } from '@/components/ui';
import { ProgressBar } from '@/components/Charts';
import { dateBR, money } from '@/lib/format';

export const metadata = { title: 'Plano e cobrança' };

const STATUS: Record<string, { label: string; tone: string }> = {
  trial: { label: 'Em teste', tone: 'bg-violet-brand/15 text-violet-brand' }, active: { label: 'Ativo', tone: 'bg-ok/15 text-ok' },
  past_due: { label: 'Pagamento pendente', tone: 'bg-danger/10 text-danger' }, canceled: { label: 'Cancelado', tone: 'bg-danger/10 text-danger' },
};

export default async function Plano() {
  const { supabase, ws, open } = await requireWorkspace('plano');
  const [{ data: plans }, { count: clients }, { count: members }] = await Promise.all([
    supabase.from('plans').select('*').order('sort'),
    supabase.from('clients').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id),
    supabase.from('workspace_members').select('id', { count: 'exact', head: true }).eq('workspace_id', ws.id).eq('active', true),
  ]);
  const cur = plans?.find((p) => p.key === ws.plan);
  return (
    <>
      <PageHeader title="Plano e cobrança" subtitle="Seu plano, limites de uso e situação da assinatura." />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title="Situação"><div className="flex items-center gap-3"><Badge tone={STATUS[ws.status]?.tone}>{STATUS[ws.status]?.label}</Badge><span className="text-sm text-muted">Plano {cur?.name ?? ws.plan}</span></div>
          {ws.status === 'trial' && <p className="mt-3 text-sm">{open ? <>Seu teste termina em <b>{dateBR(ws.trial_ends_at)}</b> ({Math.max(trialDaysLeft(ws), 0)} dia(s)).</> : <>Seu teste terminou em {dateBR(ws.trial_ends_at)}. Seus dados continuam disponíveis para consulta.</>}</p>}
          {!open && <p className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">Modo somente leitura: não é possível criar ou editar registros até regularizar a assinatura.</p>}
        </Section>
        <Section title="Uso do plano">
          <div className="space-y-4 text-sm">
            <div><div className="mb-1 flex justify-between"><span>Clientes</span><span className="text-muted">{clients ?? 0} de {cur?.max_clients ?? 'ilimitado'}</span></div>{cur?.max_clients && <ProgressBar value={((clients ?? 0) / cur.max_clients) * 100} />}</div>
            <div><div className="mb-1 flex justify-between"><span>Pessoas na equipe</span><span className="text-muted">{members ?? 0} de {cur?.max_members ?? 'ilimitado'}</span></div>{cur?.max_members && <ProgressBar value={((members ?? 0) / cur.max_members) * 100} />}</div>
          </div>
        </Section>
      </div>
      <h2 className="mb-3 text-base font-semibold">Planos</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {plans?.map((p) => (
          <div key={p.key} className={`card ${p.key === ws.plan ? 'border-accent' : ''}`}>
            <div className="flex items-baseline justify-between"><h3 className="text-lg font-semibold">{p.name}</h3>{p.key === ws.plan && <Badge tone="bg-accent/15 text-accent">Seu plano</Badge>}</div>
            <div className="mt-2 text-2xl font-semibold">{money(p.price_cents)}<span className="text-sm font-normal text-muted">/mês</span></div>
            <ul className="mt-4 space-y-1.5 text-sm text-muted"><li>✓ Todos os módulos</li><li>✓ {p.max_members ? `${p.max_members} pessoa${p.max_members > 1 ? 's' : ''}` : 'Equipe ilimitada'}</li><li>✓ {p.max_clients ? `Até ${p.max_clients} clientes` : 'Clientes ilimitados'}</li></ul>
          </div>
        ))}
      </div>
      <p className="mt-6 rounded-xl border border-line bg-subtle/50 p-4 text-sm text-muted">A cobrança automática (cartão/Pix/boleto recorrente) ainda não está conectada neste ambiente. Enquanto isso, a ativação e a troca de plano são feitas pelo responsável da plataforma (<code>/plataforma</code>). Valores e limites dos planos são editáveis na tabela <code>plans</code>.</p>
    </>
  );
}
