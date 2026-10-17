import { redirect } from 'next/navigation';
import { CheckCircle2, Circle, Clock, Send } from 'lucide-react';
import { createAnonClient } from '@/lib/supabase/anon';
import { SubmitButton } from '@/components/SubmitButton';
import { progressPct } from '@/lib/onboarding';
import { dateBR } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seu projeto', robots: { index: false, follow: false } };

const validToken = (t: string) => /^[a-f0-9]{64}$/.test(t);

async function respond(token: string, taskId: string, fd: FormData) {
  'use server';
  if (!validToken(token)) redirect(`/cliente/${token}`);
  const { data, error } = await createAnonClient().rpc('portal_respond', { p_token: token, p_task: taskId, p_response: String(fd.get('response') ?? '') });
  if (error) redirect(`/cliente/${token}?err=${encodeURIComponent(error.code === '22023' ? 'Escreva sua resposta ou cole um link.' : 'Não foi possível enviar. Tente de novo.')}`);
  redirect(`/cliente/${token}?${data ? 'ok=1' : 'err=' + encodeURIComponent('Esta etapa não está mais aberta para resposta.')}`);
}

interface Step { id: string; title: string; description: string | null; due_date: string | null; status: string; owner_side: 'estudio' | 'cliente'; client_response: string | null; client_done_at: string | null }
interface Portal { project: { name: string; status: string; start_date: string | null; due_date: string | null; welcome: string | null }; studio: { name: string; logo_url: string | null; color: string | null; email: string | null; phone: string | null }; progress: { done: number; total: number }; steps: Step[] }

export default async function Cliente({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { token } = await params; const sp = await searchParams;
  const shell = (t: string, d?: string) => <main className="grid min-h-screen place-items-center bg-[#0B0B0F] px-6 text-center text-white"><div><h1 className="text-2xl font-semibold">{t}</h1>{d && <p className="mt-2 text-sm text-white/60">{d}</p>}</div></main>;
  if (!validToken(token)) return shell('Página não encontrada', 'Verifique o link recebido.');
  const { data } = await createAnonClient().rpc('portal_open', { p_token: token });
  if (!data) return shell('Página não encontrada', 'O link pode estar incorreto ou foi desativado. Fale com o estúdio.');
  const d = data as Portal; const color = d.studio.color && /^#[0-9a-f]{6}$/i.test(d.studio.color) ? d.studio.color : '#7C5CFF';
  const pct = progressPct(d.progress.done, d.progress.total);
  const firstOpen = d.steps.find((s) => s.status !== 'feito');
  const mine = d.steps.filter((s) => s.owner_side === 'cliente' && s.status === 'a_fazer');

  return (
    <div className="min-h-screen bg-[#F6F5FA] pb-16 text-[#0B0B0F]" style={{ colorScheme: 'light', ['--c' as string]: color }}>
      <header className="px-6 py-8 text-white" style={{ background: color }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {d.studio.logo_url /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={d.studio.logo_url} alt={d.studio.name} className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" /> : null}
          <div className="text-sm font-medium opacity-90">{d.studio.name}</div>
        </div>
        <div className="mx-auto mt-6 max-w-3xl"><h1 className="text-3xl font-bold tracking-tight">{d.project.name}</h1>
          <p className="mt-2 max-w-xl text-sm opacity-90">{d.project.welcome || 'Aqui você acompanha cada etapa do seu projeto e responde o que precisamos de você.'}</p></div>
      </header>

      <main className="mx-auto -mt-5 max-w-3xl space-y-5 px-4">
        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">Andamento do projeto</span><span className="font-semibold" style={{ color }}>{pct}%</span></div>
          <div className="mt-2 h-2.5 rounded-full bg-black/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} /></div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-black/55"><span>{d.progress.done} de {d.progress.total} etapas concluídas</span>{d.project.due_date && <span>Previsão de entrega: <b>{dateBR(d.project.due_date)}</b></span>}</div>
        </section>

        {sp.ok && <p role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">Recebemos sua resposta. Obrigado! ✓</p>}
        {sp.err && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{sp.err}</p>}

        {mine.length > 0 && (
          <section className="rounded-2xl border-2 bg-white p-5 shadow-sm" style={{ borderColor: color }}>
            <h2 className="flex items-center gap-2 text-base font-semibold"><Send className="h-4 w-4" style={{ color }} strokeWidth={1.8} />O que precisamos de você</h2>
            <div className="mt-3 space-y-4">
              {mine.map((s) => (
                <form key={s.id} action={respond.bind(null, token, s.id)} className="space-y-2 rounded-xl bg-[#F6F5FA] p-4">
                  <div className="font-medium">{s.title}</div>
                  {s.description && <p className="text-sm text-black/60">{s.description}</p>}
                  {s.due_date && <p className="text-xs text-black/50">Até {dateBR(s.due_date)}</p>}
                  <textarea name="response" required minLength={2} maxLength={2000} rows={3} placeholder="Escreva aqui ou cole um link (Drive, Notion, formulário…)" className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/40" />
                  <SubmitButton className="rounded-xl bg-[var(--c)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60" pendingText="Enviando…">Enviar</SubmitButton>
                </form>))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Etapas</h2>
          <ol className="mt-4 space-y-0">
            {d.steps.map((s, i) => {
              const done = s.status === 'feito'; const current = firstOpen?.id === s.id;
              return (
                <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < d.steps.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-black/10" />}
                  <span className="relative mt-0.5 shrink-0">{done ? <CheckCircle2 className="h-6 w-6 text-green-600" strokeWidth={1.8} /> : current ? <Clock className="h-6 w-6" style={{ color }} strokeWidth={1.8} /> : <Circle className="h-6 w-6 text-black/25" strokeWidth={1.8} />}</span>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${done ? 'text-black/45 line-through' : ''}`}>{s.title}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-black/50">
                      <span>{s.owner_side === 'cliente' ? 'Com você' : 'Com o estúdio'}</span>{s.due_date && <span>{done ? 'Concluída' : 'Previsto'}: {dateBR(s.due_date)}</span>}
                      {s.status === 'revisao' && s.owner_side === 'cliente' && <span className="font-medium text-green-700">Resposta enviada, em análise</span>}
                    </div>
                  </div>
                </li>);
            })}
            {!d.steps.length && <li className="text-sm text-black/55">As etapas aparecerão aqui em breve.</li>}
          </ol>
        </section>

        {(d.studio.email || d.studio.phone) && <p className="text-center text-xs text-black/50">Dúvidas? Fale com {d.studio.name}{d.studio.email ? ` · ${d.studio.email}` : ''}{d.studio.phone ? ` · ${d.studio.phone}` : ''}</p>}
        <p className="text-center text-[11px] text-black/35">Página privada: só quem recebeu o link acessa.</p>
      </main>
    </div>
  );
}
