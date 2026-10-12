import type { ReactNode } from 'react';

/** Janelas de produto desenhadas em HTML/CSS (sem imagens): leves, nítidas e sempre fiéis ao tema. */
export function Window({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-white/10 bg-[#14141A] text-[#FAFAFD] shadow-2xl shadow-black/40 ${className}`} aria-hidden>
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5"><i className="h-2.5 w-2.5 rounded-full bg-white/15" /><i className="h-2.5 w-2.5 rounded-full bg-white/15" /><i className="h-2.5 w-2.5 rounded-full bg-white/15" /><span className="ml-3 text-[11px] text-white/40">{title}</span></div>
      <div className="p-4">{children}</div>
    </div>
  );
}

const Stat = ({ l, v, d }: { l: string; v: string; d: string }) => (
  <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><div className="text-[10px] text-white/45">{l}</div><div className="mt-1 text-lg font-semibold">{v}</div><div className="text-[10px] text-emerald-300">{d}</div></div>
);

export function DashboardMock() {
  return (
    <Window title="Visão geral">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat l="Projetos ativos" v="12" d="↑ 20%" /><Stat l="Clientes" v="28" d="↑ 12%" /><Stat l="Propostas enviadas" v="16" d="↑ 33%" /><Stat l="Receita no mês" v="R$ 48,2k" d="↑ 18%" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-white/10 p-3 sm:col-span-2">
          <div className="mb-2 text-xs font-medium">Projetos em andamento</div>
          {[['Rebranding Solar', 80], ['Website Aurora', 60], ['Campanha Lançamento', 30]].map(([n, p]) => (
            <div key={n as string} className="mb-2.5"><div className="mb-1 flex justify-between text-[10px] text-white/55"><span>{n}</span><span>{p}%</span></div><div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-[#7C5CFF]" style={{ width: `${p}%` }} /></div></div>))}
        </div>
        <div className="rounded-xl border border-white/10 p-3 sm:col-span-3">
          <div className="mb-1 text-xs font-medium">Resultados</div>
          <svg viewBox="0 0 300 90" className="h-24 w-full"><defs><linearGradient id="dg" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#7C5CFF" stopOpacity=".45" /><stop offset="1" stopColor="#7C5CFF" stopOpacity="0" /></linearGradient></defs>
            <path d="M0 70 L40 55 L75 62 L110 40 L150 48 L190 25 L230 32 L270 12 L300 18 V90 H0Z" fill="url(#dg)" /><path d="M0 70 L40 55 L75 62 L110 40 L150 48 L190 25 L230 32 L270 12 L300 18" fill="none" stroke="#A78BFF" strokeWidth="2" strokeLinejoin="round" /></svg>
        </div>
      </div>
    </Window>
  );
}

export function KanbanMock() {
  const cols: [string, string[]][] = [['Novo lead', ['Studio Aurora', 'Café Vila']], ['Proposta', ['Clínica Vita', 'Solar Energia']], ['Fechado', ['Loja Nuvem']]];
  return (
    <Window title="CRM · Funil de vendas">
      <div className="grid grid-cols-3 gap-2.5">
        {cols.map(([t, items]) => (
          <div key={t} className="rounded-xl bg-white/[.04] p-2"><div className="mb-2 flex justify-between text-[10px] text-white/55"><span>{t}</span><span>{items.length}</span></div>
            {items.map((i) => <div key={i} className="mb-1.5 rounded-lg border border-white/10 bg-[#1C1C24] p-2 text-[11px]">{i}<div className="mt-1 text-[10px] text-[#A78BFF]">R$ {(Math.abs(i.length * 370) + 900).toLocaleString('pt-BR')}</div></div>)}
          </div>))}
      </div>
    </Window>
  );
}

export function ProposalMock() {
  return (
    <Window title="Proposta · Rebranding Solar">
      <div className="rounded-xl bg-white p-4 text-[#0B0B0F]">
        <div className="text-[10px] font-semibold text-[#7C5CFF]">PROPOSTA COMERCIAL</div>
        <div className="mt-1 text-sm font-bold">Identidade visual completa</div>
        <div className="mt-3 space-y-1.5">{[['Logo + manual da marca', 'R$ 3.200'], ['Papelaria e social kit', 'R$ 1.400'], ['Landing page', 'R$ 2.600']].map(([a, b]) => <div key={a} className="flex justify-between border-b border-black/10 pb-1 text-[11px]"><span>{a}</span><span className="font-medium">{b}</span></div>)}</div>
        <div className="mt-3 flex items-center justify-between"><span className="text-[11px] font-semibold">Total R$ 7.200</span><span className="rounded-lg bg-[#7C5CFF] px-3 py-1.5 text-[11px] font-medium text-white">Aceitar proposta</span></div>
      </div>
    </Window>
  );
}

export function CalendarMock() {
  const cells = Array.from({ length: 21 }, (_, i) => i + 1);
  const ev: Record<number, string> = { 2: '#7C5CFF', 4: '#A78BFF', 7: '#7C5CFF', 9: '#C4B5FD', 11: '#A78BFF', 14: '#7C5CFF', 16: '#C4B5FD', 18: '#7C5CFF', 21: '#A78BFF' };
  return (
    <Window title="Conteúdo · Calendário editorial">
      <div className="grid grid-cols-7 gap-1.5 text-center text-[9px] text-white/40">{['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <span key={d}>{d}</span>)}
        {cells.map((c) => <div key={c} className="min-h-9 rounded-md border border-white/10 p-1 text-left text-[9px] text-white/50">{c}{ev[c] && <div className="mt-1 h-1.5 rounded-full" style={{ background: ev[c] }} />}</div>)}</div>
    </Window>
  );
}

export function FinanceMock() {
  return (
    <Window title="Financeiro · Metas">
      <div className="grid grid-cols-2 gap-2.5"><Stat l="A receber" v="R$ 18,4k" d="5 cobranças" /><Stat l="Meta do mês" v="72%" d="R$ 36k de R$ 50k" /></div>
      <div className="mt-3 flex h-20 items-end gap-2">{[35, 48, 42, 60, 55, 72, 66, 84].map((h, i) => <div key={i} className="flex-1 rounded-t-md bg-gradient-to-t from-[#7C5CFF]/30 to-[#A78BFF]" style={{ height: `${h}%` }} />)}</div>
    </Window>
  );
}
