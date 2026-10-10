import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';

const FEATURES = [
  ['CRM e funil de vendas', 'Kanban de leads, histórico de contato e alertas de follow-up.'],
  ['Propostas que vendem', 'Link exclusivo, aceite online e versão em PDF com a sua marca.'],
  ['Contratos em minutos', 'Modelos prontos preenchidos com os dados da proposta e aceite eletrônico.'],
  ['Projetos, tarefas e prazos', 'Kanban de produção, agenda unificada e alertas de atraso.'],
  ['Planejamento de conteúdo', 'Calendário por rede social, pilares e etapas de aprovação.'],
  ['Tráfego pago', 'Campanhas, métricas diárias, CPL, ROAS e alertas por cliente.'],
  ['Financeiro e metas', 'Recebíveis, recorrências, orçamento e metas com projeção.'],
  ['Painel do dia a dia', 'Tudo o que importa hoje: dinheiro, prazos, funil e conteúdo.'],
];

export default async function Home() {
  const { data } = await (await createClient()).auth.getUser();
  if (data.user) redirect('/dashboard');
  return (
    <main className="bg-[#101010] text-[#f7f6f4]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="flex items-center gap-2.5 font-semibold tracking-wide"><span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-bold text-white">G</span>{APP_NAME}</span>
        <nav className="flex gap-2"><Link href="/login" className="btn !border-white/20 !bg-transparent !text-white">Entrar</Link><Link href="/cadastro" className="btn btn-primary">Testar grátis</Link></nav>
      </header>
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pt-24">
        <p className="mb-4 inline-block rounded-full border border-white/15 px-3 py-1 text-xs uppercase tracking-widest text-white/60">{APP_TAGLINE}</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">O sistema que organiza o seu estúdio de design do primeiro lead ao último boleto.</h1>
        <p className="mt-6 max-w-xl text-lg text-white/60">Pare de alternar entre planilha, bloco de notas e cinco apps. Venda, produza, publique e acompanhe o dinheiro no mesmo lugar.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/cadastro" className="btn btn-primary !px-6 !py-3">Começar 14 dias grátis</Link><Link href="/login" className="btn !border-white/20 !bg-transparent !px-6 !py-3 !text-white">Já tenho conta</Link></div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/10 p-6"><h2 className="font-medium">{t}</h2><p className="mt-2 text-sm text-white/55">{d}</p></div>
        ))}
      </section>
    </main>
  );
}
