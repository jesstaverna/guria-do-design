import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase/anon';
import { PrintButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { dateTimeBR } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contrato', robots: { index: false, follow: false } };

const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|telegram|skype|linkedin|embedly|curl|wget|headless/i;
const validToken = (t: string) => /^[a-f0-9]{64}$/.test(t);

async function sign(token: string, fd: FormData) {
  'use server';
  if (!validToken(token)) redirect(`/c/${token}`);
  if (fd.get('agree') !== 'on') redirect(`/c/${token}?err=${encodeURIComponent('Confirme que leu e concorda com o contrato.')}`);
  const h = await headers();
  const { data, error } = await createAnonClient().rpc('contract_public_sign', {
    p_token: token, p_name: String(fd.get('name') ?? ''), p_document: String(fd.get('document') ?? ''),
    p_ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, p_ua: h.get('user-agent'),
  });
  if (error) redirect(`/c/${token}?err=${encodeURIComponent(error.code === '22023' ? 'Informe seu nome e um CPF/CNPJ com 11 ou 14 dígitos.' : 'Não foi possível registrar a assinatura.')}`);
  redirect(`/c/${token}?${data ? 'done=1' : 'err=' + encodeURIComponent('Este contrato não está mais disponível para assinatura.')}`);
}

export default async function PublicContract({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; err?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const ua = (await headers()).get('user-agent') ?? '';
  const shell = (t: string, d?: string) => <main className="grid min-h-screen place-items-center bg-[#101010] px-6 text-center text-white"><div><h1 className="text-2xl font-semibold">{t}</h1>{d && <p className="mt-2 text-white/60">{d}</p>}</div></main>;
  if (!validToken(token)) return shell('Contrato não encontrado', 'Verifique o link recebido.');
  if (BOT.test(ua)) return shell('Contrato');
  const { data } = await createAnonClient().rpc('contract_public_open', { p_token: token });
  if (!data) return shell('Contrato não encontrado', 'O link pode estar incorreto ou o contrato ainda não foi liberado.');
  const c = data as { title: string; body: string; status: string; signed_at: string | null; signed_name: string | null; body_hash: string | null; brand: { name: string; color: string | null } };
  const color = c.brand.color ?? '#7C5CFF';
  return (
    <div className="min-h-screen bg-[#ecebe7] py-6">
      <article className="print-doc mx-auto max-w-3xl bg-white px-6 py-10 text-[#101010] shadow-sm sm:px-14 sm:py-14" style={{ colorScheme: 'light' }}>
        <div className="mb-8 h-1.5 w-20 rounded-full" style={{ background: color }} />
        <pre className="whitespace-pre-wrap font-sans text-[14px] leading-relaxed">{c.body}</pre>
        {c.status === 'assinado' && <div className="mt-10 border-t border-black/10 pt-5 text-xs text-black/60">Assinado eletronicamente por <b>{c.signed_name}</b> em {dateTimeBR(c.signed_at)}. Hash SHA-256 do texto: <span className="break-all font-mono">{c.body_hash}</span></div>}
      </article>
      <section className="no-print mx-auto mt-6 max-w-3xl px-4">
        {sp.err && <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{sp.err}</p>}
        {sp.done || c.status === 'assinado' ? (
          <div className="rounded-2xl p-8 text-white" style={{ background: color }}><h2 className="text-2xl font-semibold">Contrato assinado ✓</h2><p className="mt-2 text-sm">Sua assinatura foi registrada. Guarde uma cópia usando o botão abaixo.</p></div>
        ) : (
          <form action={sign.bind(null, token)} className="space-y-4 rounded-2xl border border-black/10 bg-white p-8 text-black">
            <h2 className="text-2xl font-semibold">Assinar contrato</h2>
            <p className="text-sm text-black/60">Assinatura eletrônica simples: registramos nome, documento, data/hora, IP e um código (hash) do texto exato que você leu.</p>
            <input name="name" required placeholder="Nome completo" autoComplete="name" className="w-full rounded-xl border border-black/20 px-4 py-3 text-sm outline-none" />
            <input name="document" required placeholder="CPF ou CNPJ" inputMode="numeric" className="w-full rounded-xl border border-black/20 px-4 py-3 text-sm outline-none" />
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="agree" required className="mt-1" />Li e concordo integralmente com os termos deste contrato.</label>
            <SubmitButton className="btn btn-dark w-full" pendingText="Registrando…">Assinar</SubmitButton>
          </form>
        )}
        <div className="mt-6 flex justify-center"><PrintButton label="Baixar / imprimir" /></div>
      </section>
    </div>
  );
}
