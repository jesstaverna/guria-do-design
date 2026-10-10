import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { Badge, PageHeader, Section } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { Field } from '@/components/ui';
import { PROPOSAL_STATUS } from '@/lib/domain';
import { dateBR, dateTimeBR, money } from '@/lib/format';
import { LeadForm } from '../LeadForm';
import { addInteraction, addLeadTask, convertLead, updateLead } from '../actions';

export const metadata = { title: 'Lead' };

const KIND: Record<string, string> = { nota: 'Nota', ligacao: 'Ligação', whatsapp: 'WhatsApp', email: 'E-mail', reuniao: 'Reunião' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, open } = await requireWorkspace('crm');
  const { data: l } = await supabase.from('leads').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!l) notFound();
  const [{ data: stages }, { data: members }, { data: inter }, { data: props }, { data: tasks }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name, kind').eq('workspace_id', ws.id).order('position'),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
    supabase.from('lead_interactions').select('id, kind, content, created_at').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('proposals').select('id, number, title, status, total_cents').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, title, due_date, status').eq('lead_id', id).order('created_at', { ascending: false }).limit(5),
  ]);
  const stage = stages?.find((s) => s.id === l.stage_id);
  return (
    <>
      <PageHeader title={l.name} subtitle={[l.company, stage?.name].filter(Boolean).join(' · ')} actions={open && <>
        <Link href={`/propostas/nova?lead=${id}`} className="btn btn-primary">Criar proposta</Link>
        {!l.client_id ? <form action={convertLead.bind(null, id)}><SubmitButton className="btn" pendingText="…" confirm="Converter este lead em cliente?">Converter em cliente</SubmitButton></form> : <Link href={`/clientes/${l.client_id}`} className="btn">Ver cliente</Link>}</>} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <LeadForm action={updateLead.bind(null, id)} stages={stages ?? []} members={(members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }))} l={l} />
          <Section title="Histórico de contato">
            <form action={addInteraction.bind(null, id)} className="mb-5 flex flex-wrap gap-2">
              <select name="kind" className="input w-auto">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              <input name="content" required placeholder="O que foi conversado?" className="input min-w-48 flex-1" />
              <SubmitButton className="btn btn-primary" pendingText="…">Registrar</SubmitButton>
            </form>
            {!inter?.length ? <p className="text-sm text-muted">Sem registros.</p> : <ul className="space-y-3">{inter.map((i) => (
              <li key={i.id} className="border-l-2 border-line pl-4 text-sm"><div className="text-xs text-muted">{KIND[i.kind]} · {dateTimeBR(i.created_at)}</div>{i.content}</li>))}</ul>}
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Propostas">{!props?.length ? <p className="text-sm text-muted">Nenhuma proposta ainda.</p> : <ul className="space-y-2 text-sm">{props.map((p) => <li key={p.id} className="flex items-center justify-between gap-2"><Link href={`/propostas/${p.id}`} className="hover:underline">#{p.number} {p.title}</Link><span className="flex items-center gap-2"><span className="text-muted">{money(p.total_cents)}</span><Badge tone={PROPOSAL_STATUS[p.status]?.tone}>{PROPOSAL_STATUS[p.status]?.label}</Badge></span></li>)}</ul>}</Section>
          <Section title="Follow-up">
            {open && <form action={addLeadTask.bind(null, id)} className="mb-4 space-y-2"><Field label="Próximo passo"><input name="title" required className="input" placeholder="Ex.: mandar portfólio" /></Field><Field label="Prazo"><input name="due_date" type="date" className="input" /></Field><SubmitButton className="btn btn-sm" pendingText="…">Criar tarefa</SubmitButton></form>}
            {tasks?.length ? <ul className="space-y-1.5 text-sm">{tasks.map((t) => <li key={t.id} className={t.status === 'feito' ? 'text-muted line-through' : ''}>{t.title} <span className="text-muted">· {dateBR(t.due_date)}</span></li>)}</ul> : null}
          </Section>
        </div>
      </div>
    </>
  );
}
