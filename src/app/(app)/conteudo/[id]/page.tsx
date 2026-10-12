import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { Badge, PageHeader, Section } from '@/components/ui';
import { CopyButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { AttachmentUploader } from '@/components/AttachmentUploader';
import { DriveLinkForm } from '@/components/DriveLinkForm';
import { AutoField } from '@/components/content/AutoField';
import { CampaignPicker } from '@/components/content/CampaignPicker';
import { StatusControl } from '@/components/content/StatusControl';
import { CardsEditor, ChecklistEditor, ManyChatEditor, ReelsEditor, StoriesEditor } from '@/components/content/Editors';
import { BUCKETS, STAGE_LABEL, allCardsText, defaultChecklist, manychatText, type Card, type StageKey } from '@/lib/content';
import { formatBytes } from '@/lib/attachments';
import { FORMATS, NETWORKS } from '@/lib/domain';
import { dateTimeBR } from '@/lib/format';
import { addContentLink, deletePost, prepareContentUpload, registerContentAttachment, removeContentAttachment, savePostPatch } from '../actions';

export const metadata = { title: 'Conteúdo' };

const TABS = [['visao', 'Visão geral'], ['cards', 'Cards'], ['legenda', 'Legenda'], ['prompt', 'Prompt'], ['manychat', 'ManyChat'], ['anexos', 'Criativos / Anexos'], ['reels', 'Reels / Stories'], ['checklist', 'Checklist'], ['historico', 'Histórico']] as const;
const EVENT: Record<string, string> = { criado: 'Criado', importado: 'Importado do planejamento', status: 'Mudou de etapa', reagendado: 'Data editorial alterada', editado: 'Conteúdo editado', publicado: 'Marcado como publicado' };

export default async function PostPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { tab: t } = await searchParams;
  const tab = TABS.some(([k]) => k === t) ? t! : 'visao';
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const { data: p } = await supabase.from('content_posts').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const { pillars, campaigns, links, members } = await loadContent(supabase, ws.id);
  const [{ data: atts }, { data: events }] = await Promise.all([
    supabase.from('content_attachments').select('id, kind, provider, name, size_bytes, created_at').eq('post_id', id).order('created_at', { ascending: false }),
    tab === 'historico' ? supabase.from('content_post_events').select('id, kind, detail, created_at, actor_id').eq('post_id', id).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] as { id: number; kind: string; detail: Record<string, unknown>; created_at: string; actor_id: string | null }[] }),
  ]);
  const pillar = pillars.find((x) => x.id === p.pillar_id);
  const cards = (p.cards ?? []) as Card[];
  const save = savePostPatch.bind(null, id);
  const dis = !open;
  const mem = new Map(members.map((m) => [m.id, m.name]));
  const full = [p.title, p.hook, '', '— CARDS —', allCardsText(cards), '', '— LEGENDA —', p.caption, '', '— PROMPT —', p.image_prompt, p.manychat ? `\n— MANYCHAT —\n${manychatText(p.manychat)}` : ''].filter((x) => x !== null && x !== undefined).join('\n');
  const stageIdx = ['ideia', 'roteiro', 'producao', 'revisao', 'aprovado', 'agendado', 'publicado'].indexOf(p.status);

  return (
    <>
      <PageHeader title={p.title} subtitle={[pillar?.name, FORMATS[p.format], p.keyword && `palavra-chave ${p.keyword}`].filter(Boolean).join(' · ')} actions={<>
        <Badge tone={p.status === 'publicado' ? 'bg-ok/15 text-ok' : 'bg-accent/15 text-accent-ink'}>{STAGE_LABEL[p.status as StageKey]}</Badge>
        {p.bucket !== 'calendario' && <Badge>{BUCKETS[p.bucket as keyof typeof BUCKETS]}</Badge>}
        <CopyButton text={full} label="Copiar conteúdo completo" /><Link href="/conteudo/calendario" className="btn btn-sm">← Calendário</Link></>} />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Seções do conteúdo">
        {TABS.map(([k, l]) => <Link key={k} href={`/conteudo/${id}?tab=${k}`} role="tab" aria-selected={tab === k} className={`whitespace-nowrap px-3.5 py-2.5 text-sm ${tab === k ? 'border-b-2 border-accent font-medium' : 'text-muted hover:text-fg'}`}>{l}{k === 'anexos' && atts?.length ? ` (${atts.length})` : ''}</Link>)}
      </div>
      {p.review_required && p.status !== 'publicado' && <p className="mb-4 rounded-xl bg-amber-500/10 p-3 text-xs text-warn">Revisão humana necessária antes de publicar (texto, imagem e promessas). O Guria OS não publica nem agenda nada sozinho.</p>}

      {tab === 'visao' && (
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="card space-y-4 xl:col-span-2">
            <AutoField field="title" label="Título / tema" initial={p.title} save={save} disabled={dis} maxLength={200} />
            <AutoField field="hook" label="Headline / gancho" initial={p.hook} save={save} disabled={dis} copy />
            <AutoField field="concept" label="Conceito" kind="textarea" rows={2} initial={p.concept} save={save} disabled={dis} />
            <div className="grid gap-4 sm:grid-cols-3">
              <AutoField field="keyword" label="Palavra-chave" initial={p.keyword} save={save} disabled={dis} maxLength={80} />
              <AutoField field="category" label="Categoria" initial={p.category} save={save} disabled={dis} />
              <AutoField field="priority" label="Prioridade" kind="select" initial={p.priority} save={save} disabled={dis} options={[{ value: 'baixa', label: 'Baixa' }, { value: 'media', label: 'Normal' }, { value: 'alta', label: 'Alta' }, { value: 'urgente', label: 'Urgente' }]} />
              <AutoField field="format" label="Formato" kind="select" initial={p.format} save={save} disabled={dis} options={Object.entries(FORMATS).map(([value, label]) => ({ value, label }))} />
              <AutoField field="network" label="Plataforma" kind="select" initial={p.network} save={save} disabled={dis} options={Object.entries(NETWORKS).map(([value, v]) => ({ value, label: v.label }))} />
              <AutoField field="pillar_id" label="Pilar (um por conteúdo)" kind="select" initial={p.pillar_id ?? ''} save={save} disabled={dis} options={[{ value: '', label: '— sem pilar —' }, ...pillars.map((x) => ({ value: x.id, label: x.name }))]} />
              <AutoField field="assignee_id" label="Responsável" kind="select" initial={p.assignee_id ?? ''} save={save} disabled={dis} options={[{ value: '', label: '— ninguém —' }, ...members.map((m) => ({ value: m.id, label: m.name }))]} />
              <AutoField field="publish_date" label="Data editorial (planejamento)" kind="date" initial={p.publish_date} save={save} disabled={dis} hint="Não significa agendado no Instagram." />
              <AutoField field="platform_scheduled_at" label="Agendado na plataforma em" kind="datetime" initial={p.platform_scheduled_at} save={save} disabled={dis} hint="Só se VOCÊ agendar fora do Guria OS." />
            </div>
            <div><div className="label">Campanhas (tags)</div><CampaignPicker postId={id} campaigns={campaigns} selected={links.get(id) ?? []} disabled={dis} /></div>
            <AutoField field="internal_notes" label="Observações internas" kind="textarea" rows={3} initial={p.internal_notes} save={save} disabled={dis} />
            <AutoField field="post_url" label="Link da publicação" initial={p.post_url} save={save} disabled={dis} hint="Preencha depois de publicar." />
            <AutoField field="review_required" label="" kind="checkbox" initial={p.review_required} save={save} disabled={dis} hint="Revisão necessária antes de publicar" />
          </div>
          <div className="space-y-6">
            <Section title="Produção">
              <div className="space-y-4">
                <StatusControl postId={id} title={p.title} status={p.status as StageKey} disabled={dis} />
                <ol className="flex gap-1" aria-label="Progresso nas etapas">{[0, 1, 2, 3, 4, 5, 6].map((i) => <li key={i} className={`h-1.5 flex-1 rounded-full ${i <= stageIdx ? 'bg-accent' : 'bg-subtle'}`} />)}</ol>
                {p.status === 'publicado' && p.published_at && <p className="text-sm text-ok">Publicado em {dateTimeBR(p.published_at)}{p.published_confirmed_by ? ` · confirmado por ${mem.get(p.published_confirmed_by) ?? 'usuário'}` : ''}.</p>}
                <ul className="space-y-1 text-xs text-muted"><li>{cards.length === 7 ? '✓ 7 cards' : '○ sem cards'}</li><li>{p.has_caption ? '✓ legenda' : '○ sem legenda'}</li><li>{p.has_prompt ? '✓ prompt' : '○ sem prompt'}</li><li>{p.has_manychat ? '✓ ManyChat (rascunho, desativado)' : '○ sem ManyChat'}</li><li>{atts?.length ? `✓ ${atts.length} anexo(s)` : '○ sem anexos'}</li></ul>
              </div>
            </Section>
            <Section title="Origem">
              <dl className="space-y-1.5 text-xs text-muted"><div>Criado em {dateTimeBR(p.created_at)}</div>{p.source_import && <div>Importado: {p.source_import}</div>}{p.collection && <div>Coleção: {p.collection}</div>}{p.manually_edited_at && <div>Editado manualmente em {dateTimeBR(p.manually_edited_at)} (uma nova importação não sobrescreve).</div>}</dl>
            </Section>
            {open && <form action={deletePost.bind(null, id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Excluir este conteúdo e seus anexos? Não pode ser desfeito.">Excluir conteúdo</SubmitButton></form>}
          </div>
        </div>
      )}

      {tab === 'cards' && (
        <div className="space-y-5">
          <p className="text-sm text-muted">Carrossel com <b>exatamente 7 cards</b>. A capa leva CTA de arraste; o card 7, CTA de interação / ManyChat.</p>
          <div className="grid gap-4 sm:grid-cols-2"><AutoField field="cover_cta" label="CTA da capa (arraste)" initial={p.cover_cta} save={save} disabled={dis} copy /><AutoField field="cta" label="CTA final / comentário" initial={p.cta} save={save} disabled={dis} copy /></div>
          <CardsEditor initial={cards} save={save} disabled={dis} />
        </div>
      )}
      {tab === 'legenda' && <div className="card"><AutoField field="caption" label="Legenda completa" kind="textarea" rows={16} initial={p.caption} save={save} disabled={dis} copy maxLength={5000} hint="Texto final que será copiado para o Instagram. Hashtags ficam no próprio texto." /></div>}
      {tab === 'prompt' && (
        <div className="card space-y-5"><AutoField field="image_prompt" label="Prompt gerador de imagem" kind="textarea" rows={10} mono initial={p.image_prompt} save={save} disabled={dis} copy maxLength={8000} hint="Cole no ChatGPT/Gemini junto com a foto de referência. Revise antes de usar." />
          <AutoField field="visual_notes" label="Direção visual / referências" kind="textarea" rows={3} initial={p.visual_notes} save={save} disabled={dis} />
          {p.extra && Object.keys(p.extra).length > 0 && <dl className="grid gap-2 rounded-xl bg-subtle/50 p-3 text-xs sm:grid-cols-2">{Object.entries(p.extra as Record<string, unknown>).filter(([, v]) => typeof v === 'string').map(([k, v]) => <div key={k}><dt className="font-semibold uppercase tracking-wider text-muted">{k.replace(/_/g, ' ')}</dt><dd>{String(v)}</dd></div>)}</dl>}</div>
      )}
      {tab === 'manychat' && <div className="card"><ManyChatEditor initial={p.manychat} save={save} disabled={dis} /></div>}
      {tab === 'anexos' && (
        <Section title={`Criativos e anexos (${atts?.length ?? 0})`}>
          {!atts?.length ? <p className="text-sm text-muted">Nenhum arquivo enviado. Só entram aqui arquivos que você realmente anexar (nenhum link é inventado).</p> : (
            <ul className="space-y-2.5 text-sm">{atts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3"><div className="min-w-0"><a href={`/conteudo/anexo/${a.id}`} target={a.kind === 'link' ? '_blank' : undefined} rel="noopener noreferrer" className="break-words font-medium hover:underline">{a.kind === 'link' ? (a.provider === 'google_drive' ? '🟢 ' : '🔗 ') : '📄 '}{a.name}</a><div className="mt-0.5 text-xs text-muted">{a.kind === 'link' ? (a.provider === 'google_drive' ? 'Google Drive' : 'Link') : formatBytes(a.size_bytes)} · {dateTimeBR(a.created_at)}</div></div>
                {open && <form action={removeContentAttachment.bind(null, id, a.id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Remover este anexo?">Remover</SubmitButton></form>}</li>))}</ul>)}
          {open && <div className="mt-5 space-y-5 border-t border-line pt-5"><AttachmentUploader taskId={id} prepare={prepareContentUpload} register={registerContentAttachment} /><DriveLinkForm action={addContentLink.bind(null, id)} /></div>}
        </Section>
      )}
      {tab === 'reels' && (
        <div className="grid gap-6 lg:grid-cols-2"><Section title="Roteiro de Reels"><ReelsEditor initial={p.reels} save={save} disabled={dis} /></Section><Section title="Sequência de Stories"><StoriesEditor initial={p.stories} save={save} disabled={dis} /></Section></div>
      )}
      {tab === 'checklist' && <div className="card max-w-xl"><ChecklistEditor initial={p.checklist?.length ? p.checklist : defaultChecklist()} save={save} disabled={dis} /></div>}
      {tab === 'historico' && (
        <Section title="Histórico">
          {!events?.length ? <p className="text-sm text-muted">Sem eventos.</p> : (
            <ol className="space-y-3">{events.map((e) => { const d = e.detail as Record<string, string | null>; return (
              <li key={e.id} className="border-l-2 border-line pl-4 text-sm"><div className="font-medium">{EVENT[e.kind] ?? e.kind}</div>
                <div className="text-xs text-muted">{dateTimeBR(e.created_at)}{e.actor_id ? ` · ${mem.get(e.actor_id) ?? 'usuário'}` : e.kind === 'importado' ? ' · importação' : ''}</div>
                {e.kind === 'status' || e.kind === 'publicado' ? <div className="text-xs">{STAGE_LABEL[d.de as StageKey] ?? d.de} → {STAGE_LABEL[d.para as StageKey] ?? d.para}{d.published_at ? ` (publicado em ${dateTimeBR(d.published_at)})` : ''}</div> : null}
                {e.kind === 'reagendado' ? <div className="text-xs">{d.de ?? 'sem data'} → {d.para ?? 'sem data'}</div> : null}</li>); })}</ol>)}
        </Section>
      )}
    </>
  );
}
