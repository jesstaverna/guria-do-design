import { Suspense, type ReactNode } from 'react';
import { Flash } from '@/components/Flash';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <Suspense><Flash /></Suspense>
      <section className="hidden flex-col justify-between bg-[#101010] p-12 text-[#f7f6f4] lg:flex">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-lg font-bold text-white">G</span><span className="text-lg font-semibold tracking-wide">{APP_NAME}</span></div>
        <div>
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">CRM, propostas, contratos, conteúdo, tráfego e financeiro num só lugar.</p>
          <p className="mt-4 text-sm text-white/50">{APP_TAGLINE}</p>
        </div>
        <span className="h-1.5 w-24 rounded-full bg-gradient-to-r from-accent to-violet-brand" />
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm space-y-5">
          <div><h1 className="h1">{title}</h1><p className="mt-1.5 text-sm text-muted">{subtitle}</p></div>
          {children}
        </div>
      </section>
    </main>
  );
}
