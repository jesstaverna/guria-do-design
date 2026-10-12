import Link from 'next/link';
import { BarChart3, CalendarDays, CheckSquare, Clock, FileSignature, FileText, FolderKanban, Megaphone, MessageCircle, Palette, Receipt, Shield, StickyNote, Table2, Target, Users, Wallet, Workflow, type LucideIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { APP_DESCRIPTION, APP_NAME } from '@/lib/brand';
import { Logo } from '@/components/Logo';
import { Reveal } from '@/components/landing/Reveal';
import { CalendarMock, DashboardMock, FinanceMock, KanbanMock, ProposalMock } from '@/components/landing/Mocks';

// Valores iguais aos da tabela `plans` (migration 0001). Ao mudar preço lá, mude aqui.
const PLANS = [
  { name: 'Solo', price: 49, desc: 'Para o freelancer que quer parecer (e operar) como estúdio.', items: ['1 usuário', 'Até 30 clientes', 'CRM, propostas e contratos', 'Projetos, tarefas e conteúdo', 'Financeiro e metas', 'Sua logo e cor da marca'], hl: false },
  { name: 'Estúdio', price: 99, desc: 'Para quem tem equipe e cresce sem perder o controle.', items: ['Até 5 usuários', 'Clientes ilimitados', 'Tudo do Solo', 'Tráfego pago por cliente', 'Permissões por função', 'Prioridade no suporte'], hl: true },
];

const AUDIENCE: [LucideIcon, string, string][] = [
  [Palette, 'Designers freelancers', 'Saia do WhatsApp e da planilha: proposta bonita, contrato e cobrança num fluxo só.'],
  [Users, 'Estúdios e agências pequenas', 'Equipe, prazos e entregas visíveis para todos, cada um com a sua permissão.'],
  [CalendarDays, 'Social media e criadores', 'Pilares, calendário editorial e Kanban de produção ligados ao mesmo conteúdo.'],
  [Target, 'Quem vende serviço de design', 'Funil de vendas, follow-up e metas para saber quanto vem por aí.'],
];

const PAINS: [LucideIcon, string][] = [
  [MessageCircle, 'Orçamentos e combinados perdidos no WhatsApp'],
  [Table2, 'Clientes e cobranças espalhados em planilhas'],
  [Clock, 'Prazos que estouram porque ninguém enxergou'],
  [FileSignature, 'Contrato refeito do zero a cada novo cliente'],
  [Wallet, 'Não saber quanto vai entrar (ou faltar) no mês'],
  [StickyNote, 'Ideias de conteúdo soltas, sem calendário nem processo'],
];

const FEATURES: [LucideIcon, string, string][] = [
  [Users, 'CRM e funil', 'Kanban de leads, histórico de contato e alertas de follow-up.'],
  [FileText, 'Propostas online', 'Link exclusivo, aceite do cliente e a sua marca em tudo.'],
  [FileSignature, 'Contratos', 'Modelos prontos preenchidos com os dados da proposta.'],
  [FolderKanban, 'Projetos e tarefas', 'Lista ou Kanban, anexos, Google Drive e prazos.'],
  [CalendarDays, 'Conteúdo', 'Pilares, calendário editorial e Kanban de produção.'],
  [Megaphone, 'Tráfego pago', 'Campanhas, CPL, ROAS e alertas por cliente.'],
  [Wallet, 'Financeiro', 'Recebíveis, recorrências e fluxo do mês.'],
  [Target, 'Metas', 'Metas de receita com projeção e orçamento.'],
  [BarChart3, 'Painel do dia', 'Dinheiro, prazos, funil e conteúdo numa tela.'],
  [Shield, 'Equipe e permissões', 'Cada pessoa vê só o que precisa ver.'],
  [Palette, 'Sua marca', 'Logo, avatar e cor do estúdio no sistema inteiro.'],
  [Receipt, 'Cobrança e aceite', 'Do “sim” do cliente ao pagamento, sem perder o fio.'],
];

const REPLACES: [LucideIcon, string][] = [[Table2, 'Planilhas'], [StickyNote, 'Bloco de notas'], [CheckSquare, 'App de tarefas'], [FileSignature, 'Modelos de contrato'], [Wallet, 'Controle financeiro'], [CalendarDays, 'Agenda e calendário editorial']];

const STEPS = [['Cadastre o seu estúdio', 'Em 2 minutos: nome, logo e a cor da sua marca.'], ['Traga clientes e projetos', 'Cadastre ou importe e acompanhe tudo no funil e no Kanban.'], ['Envie, feche e entregue', 'Proposta com aceite online, contrato e acompanhamento financeiro.']];

const FAQ = [
  ['Preciso de cartão para testar?', 'Não. São 14 dias grátis para explorar tudo, sem compromisso.'],
  ['Meus dados ficam separados dos de outros estúdios?', 'Sim. Cada estúdio tem o seu espaço isolado no banco de dados, com acesso controlado por função.'],
  ['Posso usar a minha marca?', 'Sim. Logo, avatar e cor do estúdio personalizam o sistema e as propostas que o cliente vê.'],
  ['Posso cancelar quando quiser?', 'Sim. O plano é mensal, sem fidelidade.'],
  ['Funciona no celular?', 'Sim. O sistema é responsivo e funciona no navegador do celular, tablet e computador.'],
];

const Section = ({ id, kicker, title, children }: { id?: string; kicker: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20">
    <Reveal><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#A78BFF]">{kicker}</p><h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2></Reveal>
    <div className="mt-10">{children}</div>
  </section>
);

const Check = () => <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-[#A78BFF]" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

export default async function Home() {
  const { data } = await (await createClient()).auth.getUser();
  if (data.user) redirect('/dashboard');
  return (
    <main className="scroll-smooth bg-[#0B0B0F] text-[#FAFAFD]">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0B0B0F]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Logo size={32} light />
          <nav className="hidden items-center gap-7 text-sm text-white/65 md:flex"><a href="#recursos" className="hover:text-white">Recursos</a><a href="#para-quem" className="hover:text-white">Para quem é</a><a href="#planos" className="hover:text-white">Planos</a><a href="#duvidas" className="hover:text-white">Dúvidas</a></nav>
          <div className="flex gap-2"><Link href="/login" className="btn !border-white/15 !bg-transparent !text-white hover:!bg-white/5">Entrar</Link><Link href="/cadastro" className="btn btn-primary">Testar grátis</Link></div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 animate-glow rounded-full bg-[#7C5CFF]/30 blur-[120px]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-16 text-center sm:pt-24">
          <Reveal><p className="mx-auto inline-block rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs text-white/70">Gestão para designers, estúdios e agências</p></Reveal>
          <Reveal delay={80}><h1 className="mx-auto mt-6 max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">Sua agência inteira.<br /><span className="bg-gradient-to-r from-[#A78BFF] to-[#7C5CFF] bg-clip-text text-transparent">Um só lugar.</span></h1></Reveal>
          <Reveal delay={160}><p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">{APP_DESCRIPTION}</p></Reveal>
          <Reveal delay={240}><div className="mt-9 flex flex-wrap justify-center gap-3"><Link href="/cadastro" className="btn btn-primary !px-7 !py-3.5 !text-base">Começar 14 dias grátis</Link><a href="#planos" className="btn !border-white/15 !bg-transparent !px-7 !py-3.5 !text-base !text-white hover:!bg-white/5">Ver planos</a></div><p className="mt-3 text-xs text-white/40">Sem cartão de crédito · cancele quando quiser</p></Reveal>
          <Reveal delay={320} className="mx-auto mt-14 max-w-4xl text-left"><div className="animate-float motion-reduce:animate-none"><DashboardMock /></div></Reveal>
        </div>
      </section>

      {/* PROVA / NÚMEROS */}
      <section className="border-y border-white/5">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 py-8 text-center sm:grid-cols-4">
          {[['8', 'módulos num só sistema'], ['14 dias', 'de teste grátis'], ['100%', 'com a sua marca'], ['R$ 49', 'a partir de, por mês']].map(([n, l]) => <Reveal key={l}><div className="text-2xl font-bold text-[#A78BFF]">{n}</div><div className="mt-1 text-xs text-white/50">{l}</div></Reveal>)}
        </div>
      </section>

      {/* DORES (seção clara) */}
      <section className="bg-[#FAFAFD] text-[#0B0B0F]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <Reveal><p className="text-center text-xs font-semibold uppercase tracking-[.2em] text-[#7C5CFF]">Você se identifica?</p><h2 className="mx-auto mt-3 max-w-2xl text-center text-3xl font-bold tracking-tight sm:text-4xl">Pare de perder tempo (e dinheiro) com ferramentas soltas.</h2></Reveal>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PAINS.map(([Ic, t], i) => <Reveal key={t} delay={i * 50}><div className="flex items-center gap-3 rounded-2xl border border-[#E4E2F0] bg-white p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EDE6FF] text-[#7C5CFF]"><Ic className="h-[18px] w-[18px]" strokeWidth={1.6} /></span><span className="text-sm font-medium">{t}</span></div></Reveal>)}
          </div>
          <Reveal><p className="mt-8 text-center text-sm text-[#646470]">Se respondeu sim a qualquer uma, o <b className="text-[#7C5CFF]">{APP_NAME}</b> foi feito para você.</p></Reveal>
        </div>
      </section>

      {/* PARA QUEM */}
      <Section id="para-quem" kicker="Para quem é" title="Feito para quem vive de design e quer operar com clareza.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map(([Ic, t, d], i) => <Reveal key={t} delay={i * 70}><div className="h-full rounded-2xl border border-white/10 bg-white/[.03] p-6 transition hover:-translate-y-1 hover:border-[#7C5CFF]/50 hover:bg-white/[.05]"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#7C5CFF]/15 text-[#A78BFF]"><Ic className="h-5 w-5" strokeWidth={1.6} /></span><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-2 text-sm text-white/55">{d}</p></div></Reveal>)}
        </div>
      </Section>

      {/* RECURSOS COM TELAS */}
      <Section id="recursos" kicker="Recursos" title="Do primeiro contato ao último pagamento, sem trocar de ferramenta.">
        <div className="space-y-20">
          {[
            ['CRM e funil de vendas', 'Arraste leads entre etapas, registre contatos e receba alertas de follow-up. Nada de oportunidade esquecida.', <KanbanMock key="k" />],
            ['Propostas que vendem', 'Link exclusivo com a sua marca, aceite online e contrato gerado a partir da proposta aceita.', <ProposalMock key="p" />],
            ['Planejamento de conteúdo', 'Pilares, calendário editorial e Kanban de produção usando os mesmos registros. Mexeu num, atualizou nos três.', <CalendarMock key="c" />],
            ['Financeiro e metas', 'Recebíveis, recorrências e metas com projeção, para saber o mês antes de ele acabar.', <FinanceMock key="f" />],
          ].map(([t, d, mock], i) => (
            <div key={t as string} className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal className={i % 2 ? 'lg:order-2' : ''}><h3 className="text-2xl font-bold tracking-tight">{t as string}</h3><p className="mt-3 max-w-md text-white/60">{d as string}</p></Reveal>
              <Reveal delay={120}>{mock as React.ReactNode}</Reveal>
            </div>))}
        </div>
        <div className="mt-20">
          <Reveal><h3 className="text-center text-2xl font-bold tracking-tight">Tudo o que o seu estúdio precisa, sem complicação.</h3></Reveal>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([Ic, t, d], i) => <Reveal key={t} delay={(i % 3) * 70}><div className="group h-full rounded-2xl border border-white/10 bg-white/[.03] p-5 transition hover:border-[#7C5CFF]/50"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#7C5CFF]/15 text-[#A78BFF] transition group-hover:bg-[#7C5CFF] group-hover:text-white"><Ic className="h-[18px] w-[18px]" strokeWidth={1.6} /></span><h4 className="font-medium">{t}</h4></div><p className="mt-2.5 text-sm text-white/50">{d}</p></div></Reveal>)}
          </div>
        </div>
      </Section>

      {/* SUBSTITUI */}
      <section className="border-y border-white/5 bg-white/[.02]">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <Reveal><h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Menos abas abertas. <span className="text-[#A78BFF]">Mais estúdio.</span></h2><p className="mx-auto mt-3 max-w-xl text-white/55">O {APP_NAME} reúne no mesmo lugar o que hoje você faz em várias ferramentas.</p></Reveal>
          <div className="mt-10 flex flex-wrap justify-center gap-3">{REPLACES.map(([Ic, t], i) => <Reveal key={t} delay={i * 50}><span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/70"><Ic className="h-4 w-4 text-white/40" strokeWidth={1.6} /><span className="line-through decoration-white/30">{t}</span></span></Reveal>)}</div>
          <Reveal delay={200}><div className="mx-auto mt-8 inline-flex items-center gap-3 rounded-2xl border border-[#7C5CFF]/50 bg-[#7C5CFF]/10 px-6 py-4"><Workflow className="h-5 w-5 text-[#A78BFF]" strokeWidth={1.6} /><span className="text-sm">Tudo isso no <b>{APP_NAME}</b>, a partir de <b className="text-[#A78BFF]">R$ 49/mês</b></span></div></Reveal>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <Section kicker="Como funciona" title="Comece hoje, em três passos.">
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(([t, d], i) => <Reveal key={t} delay={i * 90}><div className="rounded-2xl border border-white/10 bg-white/[.03] p-6"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#7C5CFF] text-sm font-bold">{i + 1}</span><h3 className="mt-4 font-semibold">{t}</h3><p className="mt-2 text-sm text-white/55">{d}</p></div></Reveal>)}
        </div>
      </Section>

      {/* PLANOS */}
      <Section id="planos" kicker="Planos" title="Preço simples, mensal e sem fidelidade.">
        <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">
          {PLANS.map((p, i) => (
            <Reveal key={p.name} delay={i * 100}>
              <div className={`relative h-full rounded-3xl border p-7 ${p.hl ? 'border-[#7C5CFF] bg-gradient-to-b from-[#7C5CFF]/15 to-transparent' : 'border-white/10 bg-white/[.03]'}`}>
                {p.hl && <span className="absolute -top-3 left-7 rounded-full bg-[#7C5CFF] px-3 py-0.5 text-[11px] font-semibold">Mais escolhido</span>}
                <h3 className="text-lg font-semibold">{p.name}</h3><p className="mt-1 min-h-10 text-sm text-white/55">{p.desc}</p>
                <div className="mt-5 flex items-baseline gap-1"><span className="text-sm text-white/55">R$</span><span className="text-5xl font-bold tracking-tight">{p.price}</span><span className="text-sm text-white/55">/mês</span></div>
                <Link href="/cadastro" className={`btn mt-6 w-full !py-3 ${p.hl ? 'btn-primary' : '!border-white/15 !bg-transparent !text-white hover:!bg-white/5'}`}>Testar 14 dias grátis</Link>
                <ul className="mt-6 space-y-2.5 text-sm text-white/75">{p.items.map((it) => <li key={it} className="flex gap-2"><Check />{it}</li>)}</ul>
              </div>
            </Reveal>))}
        </div>
        <p className="mt-6 text-center text-xs text-white/40">Valores mensais em reais. Teste grátis por 14 dias, sem cartão.</p>
      </Section>

      {/* FAQ */}
      <Section id="duvidas" kicker="Dúvidas" title="Perguntas frequentes">
        <div className="max-w-3xl space-y-3">
          {FAQ.map(([q, a]) => <Reveal key={q}><details className="group rounded-2xl border border-white/10 bg-white/[.03] p-5 open:border-[#7C5CFF]/40"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">{q}<span className="text-[#A78BFF] transition group-open:rotate-45">+</span></summary><p className="mt-3 text-sm text-white/60">{a}</p></details></Reveal>)}
        </div>
      </Section>

      {/* CTA FINAL */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#7C5CFF] via-[#6B4BF8] to-[#4A28EA] p-10 text-center sm:p-16">
            <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">Pronto para organizar sua agência inteira?</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/80">Teste o {APP_NAME} por 14 dias e veja a sua operação inteira organizada.</p>
            <Link href="/cadastro" className="btn mt-8 !border-transparent !bg-white !px-8 !py-3.5 !text-base !font-semibold !text-[#4A28EA] hover:!bg-white/90">Criar minha conta grátis</Link>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-xs text-white/40"><Logo size={26} light /><span>© {new Date().getFullYear()} {APP_NAME}. Todos os direitos reservados.</span><span className="flex gap-4"><Link href="/login" className="hover:text-white">Entrar</Link><Link href="/cadastro" className="hover:text-white">Criar conta</Link></span></div>
      </footer>
    </main>
  );
}
