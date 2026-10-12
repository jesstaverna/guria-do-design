import { Suspense, type ReactNode } from 'react';
import { Flash } from '@/components/Flash';
import { Logo } from '@/components/Logo';
import { APP_DESCRIPTION } from '@/lib/brand';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <Suspense><Flash /></Suspense>
      <section className="hidden flex-col justify-between bg-[#0B0B0F] p-12 text-[#FAFAFD] lg:flex">
        <Logo size={40} light />
        <div>
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">Sua agência inteira. <span className="text-accent">Um só lugar.</span></p>
          <p className="mt-4 max-w-md text-sm text-white/55">{APP_DESCRIPTION}</p>
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
