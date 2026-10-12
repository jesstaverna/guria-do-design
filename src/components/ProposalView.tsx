import { dateBR, money } from '@/lib/format';

export interface ProposalViewData {
  number: number; title: string; intro: string | null; diagnosis: string | null; scope: string | null; exclusions: string | null; timeline: string | null;
  payment_terms: string | null; closing: string | null; valid_until: string | null; contract_months: number; discount_cents: number;
  one_time_cents: number; monthly_cents: number; total_cents: number; client_name?: string | null;
  items: { name: string; description: string | null; billing: 'pontual' | 'mensal'; quantity: number; unit_price_cents: number }[];
  brand: { name: string; legal_name?: string | null; document?: string | null; email?: string | null; phone?: string | null; logo_url?: string | null; color?: string | null; instagram?: string | null; city?: string | null };
}

function Block({ title, text, color }: { title: string; text: string | null; color: string }) {
  if (!text?.trim()) return null;
  return (
    <section className="break-inside-avoid py-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color }}>{title}</h2>
      <p className="whitespace-pre-line text-[15px] leading-relaxed">{text}</p>
    </section>
  );
}

/** Documento da proposta (fundo claro, bom para tela e PDF por impressão). Usado na prévia interna e no link público. */
export function ProposalView({ p }: { p: ProposalViewData }) {
  const color = p.brand.color && /^#[0-9a-f]{6}$/i.test(p.brand.color) ? p.brand.color : '#7C5CFF';
  return (
    <article className="print-doc mx-auto max-w-4xl bg-white px-6 py-10 text-[#101010] shadow-sm sm:px-14 sm:py-16" style={{ colorScheme: 'light' }}>
      <header className="border-b-4 pb-10" style={{ borderColor: color }}>
        <div className="flex items-center justify-between gap-4">
          {p.brand.logo_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.brand.logo_url} alt={p.brand.name} className="h-12 max-w-[200px] object-contain" /> : <span className="text-lg font-semibold tracking-wide">{p.brand.name}</span>}
          <span className="text-sm text-black/50">Proposta nº {p.number}</span>
        </div>
        <h1 className="mt-14 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{p.title}</h1>
        {p.client_name && <p className="mt-4 text-lg text-black/60">Preparada para {p.client_name}</p>}
        {p.valid_until && <p className="mt-1 text-sm text-black/45">Válida até {dateBR(p.valid_until)}</p>}
      </header>
      <Block title="Apresentação" text={p.intro} color={color} />
      <Block title="Diagnóstico" text={p.diagnosis} color={color} />
      <Block title="Escopo e entregas" text={p.scope} color={color} />
      <Block title="Não está incluso" text={p.exclusions} color={color} />
      <Block title="Cronograma" text={p.timeline} color={color} />
      <section className="break-inside-avoid py-6">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color }}>Investimento</h2>
        <div className="overflow-hidden rounded-2xl border border-black/10">
          <table className="w-full text-sm">
            <thead className="bg-black/[0.04] text-left text-xs uppercase tracking-wider text-black/50"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qtd</th><th className="px-4 py-3 text-right">Valor</th></tr></thead>
            <tbody className="divide-y divide-black/10">
              {p.items.map((i, n) => (
                <tr key={n}>
                  <td className="px-4 py-3"><div className="font-medium">{i.name} {i.billing === 'mensal' && <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal">mensal</span>}</div>{i.description && <div className="text-xs text-black/55">{i.description}</div>}</td>
                  <td className="px-4 py-3 text-right">{Number(i.quantity)}</td>
                  <td className="px-4 py-3 text-right">{money(Math.round(Number(i.quantity) * Number(i.unit_price_cents)))}{i.billing === 'mensal' ? '/mês' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 space-y-1.5 text-sm">
          {p.one_time_cents > 0 && <div className="flex justify-between"><dt className="text-black/55">Valor pontual</dt><dd>{money(p.one_time_cents)}</dd></div>}
          {p.monthly_cents > 0 && <div className="flex justify-between"><dt className="text-black/55">Mensalidade × {p.contract_months} {p.contract_months > 1 ? 'meses' : 'mês'}</dt><dd>{money(p.monthly_cents)} × {p.contract_months}</dd></div>}
          {p.discount_cents > 0 && <div className="flex justify-between"><dt className="text-black/55">Desconto</dt><dd>− {money(p.discount_cents)}</dd></div>}
          <div className="flex justify-between border-t border-black/10 pt-3 text-lg font-semibold"><dt>Total</dt><dd style={{ color }}>{money(p.total_cents)}</dd></div>
        </dl>
      </section>
      <Block title="Condições de pagamento" text={p.payment_terms} color={color} />
      <Block title="Próximos passos" text={p.closing} color={color} />
      <footer className="mt-10 border-t border-black/10 pt-6 text-xs text-black/50">
        <div className="font-medium text-black/70">{p.brand.legal_name || p.brand.name}{p.brand.document ? ` · ${p.brand.document}` : ''}</div>
        <div>{[p.brand.email, p.brand.phone, p.brand.instagram, p.brand.city].filter(Boolean).join(' · ')}</div>
      </footer>
    </article>
  );
}
