import { moneyCompact } from '@/lib/format';

export interface BarPoint { label: string; a: number; b?: number }

/** Barras agrupadas em SVG, sem dependências. a = entradas, b = saídas (centavos). */
export function RevenueChart({ data, aLabel = 'Recebido', bLabel = 'Despesas pagas' }: { data: BarPoint[]; aLabel?: string; bLabel?: string }) {
  const w = 720, h = 220, pad = { l: 8, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const slot = (w - pad.l - pad.r) / data.length;
  const bw = Math.min(18, slot / 3);
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  if (data.every((d) => d.a + (d.b ?? 0) === 0)) return <div className="grid h-[220px] place-items-center text-sm text-muted">Sem movimentação financeira no período.</div>;
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`${aLabel} e ${bLabel} por mês`}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="rgb(var(--line))" strokeDasharray={t ? '3 4' : undefined} />
            {t > 0 && <text x={pad.l} y={y(max * t) - 4} fontSize="10" fill="rgb(var(--muted))">{moneyCompact(max * t)}</text>}
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + slot * i + slot / 2;
          return (
            <g key={d.label}>
              <rect x={cx - bw - 1} y={y(d.a)} width={bw} height={Math.max(h - pad.b - y(d.a), 0)} rx="3" fill="#dd00dd"><title>{`${d.label} — ${aLabel} ${moneyCompact(d.a)}`}</title></rect>
              <rect x={cx + 1} y={y(d.b ?? 0)} width={bw} height={Math.max(h - pad.b - y(d.b ?? 0), 0)} rx="3" fill="#7327ea"><title>{`${d.label} — ${bLabel} ${moneyCompact(d.b ?? 0)}`}</title></rect>
              <text x={cx} y={h - 10} fontSize="10" textAnchor="middle" fill="rgb(var(--muted))">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" />{aLabel}</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-violet-brand" />{bLabel}</span>
      </figcaption>
    </figure>
  );
}

/** Linha simples (uma série) para tendências diárias. */
export function LineChart({ points, label, format = (v: number) => String(v) }: { points: { x: string; y: number }[]; label: string; format?: (v: number) => string }) {
  const w = 720, h = 160, p = { l: 8, r: 8, t: 14, b: 22 };
  if (points.length < 2) return <div className="grid h-[160px] place-items-center text-sm text-muted">Dados insuficientes para o gráfico.</div>;
  const max = Math.max(1, ...points.map((q) => q.y));
  const X = (i: number) => p.l + ((w - p.l - p.r) * i) / (points.length - 1);
  const Y = (v: number) => p.t + (h - p.t - p.b) * (1 - v / max);
  const d = points.map((q, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={label}>
      <line x1={p.l} x2={w - p.r} y1={h - p.b} y2={h - p.b} stroke="rgb(var(--line))" />
      <text x={p.l} y={p.t - 3} fontSize="10" fill="rgb(var(--muted))">{format(max)}</text>
      <path d={d} fill="none" stroke="#dd00dd" strokeWidth="2" strokeLinejoin="round" />
      {points.map((q, i) => <circle key={q.x} cx={X(i)} cy={Y(q.y)} r="2.5" fill="#dd00dd"><title>{`${q.x}: ${format(q.y)}`}</title></circle>)}
      <text x={p.l} y={h - 6} fontSize="10" fill="rgb(var(--muted))">{points[0].x}</text>
      <text x={w - p.r} y={h - 6} fontSize="10" textAnchor="end" fill="rgb(var(--muted))">{points[points.length - 1].x}</text>
    </svg>
  );
}

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'danger' | 'ok' }) {
  const v = Math.min(Math.max(value, 0), 100);
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${tone === 'danger' ? 'bg-danger' : tone === 'ok' ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${v}%` }} />
    </div>
  );
}
