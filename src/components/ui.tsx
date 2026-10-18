import Link from 'next/link';
import type { ReactNode } from 'react';
import { AutoIcon, hasIcon } from '@/components/Icon';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="h1">{title}</h1>{subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint, tone, href, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'ok' | 'accent'; href?: string; icon?: string }) {
  const accent = tone === 'accent';
  const chip = accent ? 'bg-white/20 text-on-accent' : tone === 'danger' ? 'bg-danger/10 text-danger' : tone === 'ok' ? 'bg-ok/10 text-ok' : 'bg-accent/10 text-accent';
  const ic = hasIcon(label, icon) ? <AutoIcon text={label} icon={icon} className="h-[18px] w-[18px]" /> : null;
  const body = (
    <div className={`card h-full ${accent ? 'border-transparent bg-accent text-on-accent' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`text-xs font-medium uppercase tracking-wider ${accent ? 'text-on-accent/70' : 'text-muted'}`}>{label}</div>
        {ic && <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}>{ic}</span>}
      </div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight ${tone === 'danger' ? 'text-danger' : tone === 'ok' ? 'text-ok' : ''}`}>{value}</div>
      {hint && <div className={`mt-1.5 text-xs ${accent ? 'text-on-accent/70' : 'text-muted'}`}>{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block transition hover:opacity-90">{body}</Link> : body;
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="text-base font-medium">{title}</div>
      {text && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Badge({ children, tone = 'bg-subtle text-muted' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge border-transparent ${tone}`}>{children}</span>;
}

export function Tabs({ items, current }: { items: { key: string; label: string; href: string }[]; current: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.key} href={t.href} className={`whitespace-nowrap px-4 py-2.5 text-sm ${current === t.key ? 'border-b-2 border-accent font-medium' : 'text-muted hover:text-fg'}`}>{t.label}</Link>
      ))}
    </div>
  );
}

export function Section({ title, actions, children, icon }: { title: string; actions?: ReactNode; children: ReactNode; icon?: string }) {
  const ic = typeof title === 'string' && hasIcon(title, icon) ? <AutoIcon text={title} icon={icon} className="h-4 w-4" /> : null;
  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold">{ic && <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">{ic}</span>}{title}</h2>{actions}</div>
      {children}
    </section>
  );
}

/** Seletor de mês (?m=yyyy-mm) com navegação anterior/próximo. */
export function MonthNav({ base, ym, label, extra = '' }: { base: string; ym: string; label: string; extra?: string }) {
  const [y, m] = ym.split('-').map(Number);
  const shift = (d: number) => { const t = y * 12 + (m - 1) + d; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const q = (v: string) => `${base}?m=${v}${extra}`;
  return (
    <div className="flex items-center gap-2">
      <Link href={q(shift(-1))} className="btn btn-sm" aria-label="Mês anterior">←</Link>
      <span className="min-w-36 text-center text-sm font-medium capitalize">{label}</span>
      <Link href={q(shift(1))} className="btn btn-sm" aria-label="Próximo mês">→</Link>
    </div>
  );
}
