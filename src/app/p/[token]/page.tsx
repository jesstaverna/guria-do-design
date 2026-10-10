import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase/anon';
import { ProposalView, type ProposalViewData } from '@/components/ProposalView';
import { PrintButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proposta comercial', robots: { index: false, follow: false } };

// Robôs de pré-visualização (WhatsApp, Slack...) não contam como visualização do cliente.
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|skype|linkedin|embedly|curl|wget|headless/i;
const validToken = (t: string) => /^[a-f0-9]{64}$/.test(t);

async function evidence() {
  const h = await headers();
  return { p_ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, p_ua: h.get('user-agent') };
}

async function accept(token: string, fd: FormData) {
  'use server';
  if (!validToken(token)) redirect(`/p/${token}`);
  if (fd.get('agree') !== 'on') redirect(`/p/${token}?err=${encodeURIComponent('Confirme que leu e concorda com a proposta.')}`);
  const { data, error } = await createAnonClient().rpc('proposal_public_accept', { p_token: token, p_name: String(fd.get('name') ?? ''), p_email: String(fd.get('email') ?? ''), ...(await evidence()) });
  if (error) redirect(`/p/${token}?err=${encodeURIComponent(error.code === '22023' ? 'Informe nome e e-mail válidos.' : 'Não foi possível registrar o aceite.')}`);
  redirect(`/p/${token}?${data ? 'done=accepted' : 'err=' + encodeURIComponent('Esta proposta não está mais disponível para aceite.')}`);
}

async function requestChanges(token: string, fd: FormData) {
  'use server';
  if (!validToken(token)) redirect(`/p/${token}`);
  const { data, error } = await createAnonClient().rpc('proposal_public_request_changes', { p_token: token, p_name: String(fd.get('name') ?? ''), p_message: String(fd.get('message') ?? ''), ...(await evidence()) });
  if (error) redirect(`/p/${token}?err=${encodeURIComponent('Descreva as alterações desejadas.')}`);
  redirect(`/p/${token}?${data ? 'done=changes' : 'err=' + encodeURIComponent('Esta proposta não está mais disponível.')}`);
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-[#101010] px-6 text-center text-white"><div>{children}</div></main>;
}

export default async function PublicProposal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const { p_ua } = await evidence();
  if (!validToken(token)) return <Shell><h1 className="text-2xl font-semibold">Proposta não encontrada</h1><p className="mt-2 text-white/60">Verifique o link recebido.</p></Shell>;
  if (BOT.test(p_ua ?? '')) return <Shell><h1 className="text-2xl font-semibold">Proposta comercial</h1></Shell>;

  const { data } = await createAnonClient().rpc('proposal_public_open', { p_token: token, ...(await evidence()) });
  if (!data) return <Shell><h1 className="text-2xl font-semibold">Proposta não encontrada</h1><p className="mt-2 text-white/60">O link pode estar incorreto ou a proposta ainda não foi liberada.</p></Shell>;
  const p = data as ProposalViewData & { status: string; accepted_at: string | null; accepted_by_name: string | null };
  const open = ['enviada', 'visualizada', 'em_negociacao'].includes(p.status);
  const color = p.brand.color ?? '#dd00dd';

  return (
    <div className="min-h-screen bg-[#ecebe7] py-6">
      <ProposalView p={p} />
      <section className="mx-auto mt-6 max-w-4xl px-4">
        <div className="no-print">
          {sp.err && <p role="alert" className="mb-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{sp.err}</p>}
          {sp.done === 'accepted' || p.status === 'aceita' ? (
            <div className="rounded-2xl p-8 text-white" style={{ background: color }}><h2 className="text-2xl font-semibold">Proposta aceita ✓</h2><p className="mt-2 text-sm">{p.accepted_by_name ? `Aceite registrado por ${p.accepted_by_name}` : 'Aceite registrado'}{p.accepted_at ? ` em ${dateTimeBR(p.accepted_at)}` : ''}. Em breve você receberá os próximos passos (contrato e início).</p></div>
          ) : sp.done === 'changes' ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8"><h2 className="text-2xl font-semibold">Recebemos seu pedido</h2><p className="mt-2 text-sm text-black/60">Vamos analisar as alterações e retornar com uma nova versão.</p></div>
          ) : p.status === 'expirada' ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8"><h2 className="text-2xl font-semibold">Proposta expirada</h2><p className="mt-2 text-sm text-black/60">O prazo de validade terminou. Fale com {p.brand.name} para renová-la.</p></div>
          ) : p.status === 'recusada' ? (
            <div className="rounded-2xl border border-black/10 bg-white p-8"><h2 className="text-2xl font-semibold">Proposta encerrada</h2></div>
          ) : open && (
            <div className="grid gap-6 lg:grid-cols-2">
              <form action={accept.bind(null, token)} className="space-y-4 rounded-2xl p-8 text-white" style={{ background: color }}>
                <h2 className="text-2xl font-semibold">Aceitar proposta</h2>
                <p className="text-sm text-white/80">O aceite registra nome, e-mail, data/hora e IP como comprovação.</p>
                <input name="name" required placeholder="Seu nome completo" autoComplete="name" className="w-full rounded-xl border border-white/30 bg-white/90 px-4 py-3 text-sm text-black outline-none" />
                <input name="email" type="email" required placeholder="Seu e-mail" autoComplete="email" className="w-full rounded-xl border border-white/30 bg-white/90 px-4 py-3 text-sm text-black outline-none" />
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1" />Li a proposta e concordo com o escopo, valores e condições apresentados.</label>
                <SubmitButton className="btn btn-dark w-full" pendingText="Registrando…">Aceitar proposta</SubmitButton>
              </form>
              <form action={requestChanges.bind(null, token)} className="space-y-4 rounded-2xl border border-black/10 bg-white p-8 text-black">
                <h2 className="text-2xl font-semibold">Solicitar alterações</h2>
                <input name="name" placeholder="Seu nome" autoComplete="name" className="w-full rounded-xl border border-black/20 px-4 py-3 text-sm outline-none" />
                <textarea name="message" required rows={4} placeholder="O que você gostaria de ajustar?" className="w-full rounded-xl border border-black/20 px-4 py-3 text-sm outline-none" />
                <SubmitButton className="btn w-full !bg-white !text-black" pendingText="Enviando…">Enviar pedido de alteração</SubmitButton>
              </form>
            </div>
          )}
          <div className="mt-8 flex justify-center"><PrintButton label="Baixar em PDF" /></div>
        </div>
      </section>
    </div>
  );
}
