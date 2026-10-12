import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { analyzeNow, convertToLead, deleteProspect, saveProspectNotes, setProspectStatus, useContactEmail } from '../actions';
import { PROSPECT_STATUS, SERVICE_LABEL, whatsappLink } from '@/lib/prospecting/services';
import { EMAIL_KIND_LABEL, type EmailKind } from '@/lib/prospecting/emails';
import { whatsappSignal } from '@/lib/prospecting/phone';
import { ChannelBadges } from '../ChannelBadges';
import type { SiteFindings } from '@/lib/prospecting/analysis';
import { dateTimeBR } from '@/lib/format';

export const maxDuration = 60;
const Yes = ({ v, label }: { v: boolean; label: string }) => <li className="flex items-center justify-between gap-3"><span>{label}</span><span className={`badge ${v ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}`}>{v ? 'encontrado' : 'não encontrado'}</span></li>;

export default async function ProspectoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, ws } = await requireWorkspace('prospeccao');
  const { data: p } = await supabase.from('prospects').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const an = (p.analysis ?? null) as { site: SiteFindings | null; reasons: string[]; observations: string[]; need_score?: number; contact_bonus?: number; email_source?: string } | null;
  const site = an?.site ?? null; const st = PROSPECT_STATUS[p.status] ?? PROSPECT_STATUS.novo;
  const locked = ['descartado', 'convertido'].includes(p.status);
  const siteNumbers = site?.whatsappNumbers ?? [];
  const sig = whatsappSignal(p.phone, siteNumbers);
  const emailFromSite = an?.email_source === 'site';
  const wa = whatsappLink(siteNumbers[0] ?? p.phone);

  return (
    <>
      <PageHeader title={p.name} subtitle={[p.category, p.address].filter(Boolean).join(' · ') || undefined} actions={<><span className={`badge ${st.tone}`}>{st.label}</span><Link href="/prospeccao" className="btn btn-sm">← Prospecção</Link></>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><div className="text-xs font-medium uppercase tracking-wider text-muted">Oportunidade</div>
                <div className="mt-1 text-4xl font-semibold">{p.score ?? '—'}<span className="text-base font-normal text-muted">/100</span></div>
                <div className="mt-1 text-sm">Serviço sugerido: <b>{p.recommended_service ? SERVICE_LABEL[p.recommended_service as keyof typeof SERVICE_LABEL] ?? '—' : '—'}</b></div></div>
              <div className="flex flex-wrap gap-2">
                <form action={analyzeNow.bind(null, id)}><SubmitButton className="btn btn-sm" pendingText="Analisando…">{p.analyzed_at ? 'Reanalisar' : 'Analisar agora'}</SubmitButton></form>
                {!locked && <form action={convertToLead.bind(null, id)}><SubmitButton className="btn btn-sm btn-primary" pendingText="…">Converter em lead</SubmitButton></form>}
              </div>
            </div>
            {an && <div className="mt-5 border-t border-line pt-4">
              <h2 className="mb-2 text-sm font-semibold">O que observamos (dados públicos)</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">{an.observations.map((o) => <li key={o}>{o}</li>)}{!an.observations.length && <li className="list-none text-muted">Nada a destacar.</li>}</ul>
              {an.need_score != null && <p className="mt-3 text-sm">Necessidade <b>{an.need_score}</b> · alcance de contato <b>{(an.contact_bonus ?? 0) >= 0 ? '+' : ''}{an.contact_bonus ?? 0}</b> = {p.score}/100.</p>}
              <p className="mt-3 text-xs text-muted">Pontuação por regras simples, não por estatística: use como triagem. Última análise: {dateTimeBR(p.analyzed_at)}.</p>
            </div>}
            {p.analysis_error && <p className="mt-3 text-sm text-danger">Erro na última análise: {p.analysis_error}</p>}
          </section>

          {site && (
            <section className="card"><h2 className="mb-1 text-base font-semibold">Contatos e pessoas encontrados no site</h2>
              <p className="mb-3 text-xs text-muted">Só o que a própria empresa publicou em páginas públicas ({(site.pagesChecked ?? []).length || 1} página(s) verificada(s)). Não adivinhamos e-mails nem consultamos redes pessoais.</p>
              {(site.contacts ?? []).length === 0 && (site.people ?? []).length === 0 ? <p className="text-sm text-muted">Nenhum e-mail ou cargo comercial/compras/direção publicado nas páginas verificadas. Tente o telefone, o WhatsApp ou o formulário do site.</p> : (<>
                {(site.contacts ?? []).length > 0 && <ul className="space-y-2 text-sm">{(site.contacts ?? []).map((c: { email: string; kind: string }) => (
                  <li key={c.email} className="flex flex-wrap items-center justify-between gap-2"><span><b>{c.email}</b> <span className="badge ml-1">{EMAIL_KIND_LABEL[c.kind as EmailKind] ?? c.kind}</span></span>
                    {p.email === c.email ? <span className="text-xs text-muted">em uso</span> : <form action={useContactEmail.bind(null, id)}><input type="hidden" name="email" value={c.email} /><SubmitButton className="btn btn-sm" pendingText="…">Usar este e-mail</SubmitButton></form>}</li>))}</ul>}
                {(site.people ?? []).length > 0 && <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">{(site.people ?? []).map((x: { role: string; title: string; name?: string }) => <li key={x.role + x.title + (x.name ?? '')}><span className="badge mr-2">{x.role === 'comercial' ? 'Comercial' : x.role === 'compras' ? 'Compras' : 'Direção'}</span>{x.name ? <b>{x.name} — </b> : null}{x.title}</li>)}</ul>}
              </>)}
            </section>)}

          {site && (
            <section className="card"><h2 className="mb-3 text-base font-semibold">Site e presença online</h2>
              {!site.reachable ? <p className="text-sm text-warn">Site inacessível na análise ({site.error}).</p> : (
                <><ul className="space-y-2 text-sm"><Yes v={site.https} label="Conexão segura (HTTPS)" /><Yes v={site.hasViewport} label="Adaptação para celular" /><Yes v={site.hasMetaDescription} label="Descrição para o Google" /><Yes v={site.hasWhatsappLink} label="Botão/link de WhatsApp" /><Yes v={site.hasContactForm} label="Formulário de contato" /><Yes v={site.hasAdsPixel} label="Pixel/tag de anúncios" /><Yes v={site.hasFavicon} label="Ícone da aba (favicon)" /><Yes v={site.hasShareImage} label="Imagem de compartilhamento" />
                  {typeof site.pageSpeedScore === 'number' && <li className="flex justify-between"><span>Velocidade no celular (PageSpeed)</span><b>{site.pageSpeedScore}/100</b></li>}</ul>
                  <div className="mt-4 text-sm"><span className="label">Redes sociais encontradas no site</span>{Object.keys(site.socials).length ? <ul className="space-y-1">{Object.entries(site.socials).map(([k, v]) => <li key={k}><a className="underline" href={v} target="_blank" rel="noreferrer noopener">{k}</a></li>)}</ul> : <span className="text-muted">nenhuma</span>}</div></>)}
            </section>)}
        </div>

        <aside className="space-y-6">
          <section className="card text-sm"><h2 className="mb-3 text-base font-semibold">Dados</h2><dl className="space-y-2">
            <div className="flex justify-between gap-3"><dt className="text-muted">Site</dt><dd className="truncate">{p.website ? <a className="underline" href={/^https?:/i.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer noopener">{p.website_domain}</a> : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">E-mail</dt><dd className="truncate">{p.email ?? '—'}{emailFromSite && <span className="ml-1 text-xs text-muted">(achado no site)</span>}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Telefone</dt><dd>{p.phone ?? '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Google</dt><dd>{p.rating ? `${String(p.rating).replace('.', ',')} ★ (${p.reviews_count ?? 0})` : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Origem</dt><dd>{p.source === 'google_maps' ? 'Google Maps' : 'Manual'}</dd></div></dl>
            <div className="mt-4 border-t border-line pt-3"><div className="label">Canais disponíveis</div><ChannelBadges email={p.email} emailFromSite={emailFromSite} phone={p.phone} siteNumbers={siteNumbers} linkedin={site?.socials?.linkedin} people={site?.people} analyzed={!!p.analyzed_at} /><p className="mt-2 text-xs text-muted">{sig.detail}</p></div>
            <div className="mt-3 flex flex-wrap gap-3">
              {wa && <a className="underline" href={wa} target="_blank" rel="noreferrer noopener">Abrir conversa no WhatsApp</a>}
              {p.email && <a className="underline" href={`mailto:${p.email}`}>Escrever e-mail</a>}
              {p.maps_url && <a className="underline" href={p.maps_url} target="_blank" rel="noreferrer noopener">Ver no Google Maps</a>}
              {p.lead_id && <Link href={`/crm/${p.lead_id}`} className="underline">Ver lead no CRM</Link>}
            </div>
          </section>

          <section className="card"><h2 className="mb-3 text-base font-semibold">Anotações</h2>
            <form action={saveProspectNotes.bind(null, id)} className="space-y-2"><textarea name="notes" rows={4} defaultValue={p.notes ?? ''} className="input" placeholder="Como foi a abordagem, próximos passos…" /><SubmitButton className="btn btn-sm" pendingText="…">Salvar anotações</SubmitButton></form>
          </section>

          {!locked && <section className="card"><h2 className="mb-3 text-base font-semibold">Andamento</h2><div className="space-y-2">
            {p.status !== 'contatado' && <form action={setProspectStatus.bind(null, id, 'contatado')}><SubmitButton className="btn btn-sm w-full" pendingText="…">Marcar como contatado</SubmitButton></form>}
            {p.status !== 'respondeu' && <form action={setProspectStatus.bind(null, id, 'respondeu')}><SubmitButton className="btn btn-sm w-full" pendingText="…">Respondeu / demonstrou interesse</SubmitButton></form>}
            <form action={setProspectStatus.bind(null, id, 'descartado')}><SubmitButton className="btn btn-sm w-full" pendingText="…" confirm="Descartar este prospecto?">Descartar</SubmitButton></form></div></section>}
          <form action={deleteProspect.bind(null, id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Excluir este prospecto definitivamente?">Excluir prospecto</SubmitButton></form>
        </aside>
      </div>
    </>
  );
}
