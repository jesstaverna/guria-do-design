import Link from 'next/link';
import { notFound } from 'next/navigation';
import { APP_URL } from '@/lib/brand';
import { requireWorkspace } from '@/lib/session';
import { Badge, Field, PageHeader, Section } from '@/components/ui';
import { CopyButton, PrintButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { CONTRACT_STATUS } from '@/lib/domain';
import { missingVars } from '@/lib/contracts';
import { dateTimeBR } from '@/lib/format';
import { cancelContract, saveContract, sendContract } from '../actions';

export const metadata = { title: 'Contrato' };

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, open } = await requireWorkspace('contratos');
  const { data: c } = await supabase.from('contracts').select('*, client:clients(id, name)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!c) notFound();
  const draft = c.status === 'rascunho';
  const missing = missingVars(c.body);
  const client = c.client as { id: string; name: string } | null;

  return (
    <>
      <PageHeader title={`#${c.number} · ${c.title}`} subtitle={client ? `Cliente: ${client.name}` : undefined} actions={<>
        <Badge tone={CONTRACT_STATUS[c.status]?.tone}>{CONTRACT_STATUS[c.status]?.label}</Badge>
        <PrintButton label="Imprimir / PDF" />
        {c.status !== 'rascunho' && c.status !== 'cancelado' && <CopyButton text={`${APP_URL}/c/${c.token}`} label="Copiar link de assinatura" />}
        {open && draft && <form action={sendContract.bind(null, id)}><SubmitButton className="btn btn-primary btn-sm" pendingText="…" confirm="Liberar o contrato para assinatura? O texto ficará bloqueado.">Liberar para assinatura</SubmitButton></form>}
      </>} />
      {draft && missing > 0 && <p className="mb-4 rounded-xl bg-amber-500/15 p-3 text-sm text-warn">Há {missing} campo(s) <b>[________]</b> a preencher no texto antes de enviar.</p>}
      <div className="grid gap-6 xl:grid-cols-3">
        <form action={saveContract.bind(null, id)} className="space-y-4 xl:col-span-2">
          <fieldset disabled={!draft || !open} className="card space-y-4">
            <Field label="Título"><input name="title" defaultValue={c.title} className="input" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Início"><input name="start_date" type="date" defaultValue={c.start_date ?? ''} className="input" /></Field><Field label="Término"><input name="end_date" type="date" defaultValue={c.end_date ?? ''} className="input" /></Field></div>
            <Field label="Texto do contrato" hint={draft ? 'Edite livremente. Após o envio, o texto fica bloqueado.' : 'Texto bloqueado após o envio.'}><textarea name="body" rows={28} defaultValue={c.body} className="input font-mono !text-[13px] leading-relaxed" /></Field>
            {draft && open && <SubmitButton>Salvar rascunho</SubmitButton>}
          </fieldset>
        </form>
        <div className="space-y-6">
          {c.status === 'assinado' && (
            <Section title="Evidências da assinatura">
              <dl className="space-y-2 text-sm">
                <div><dt className="text-xs text-muted">Assinado por</dt><dd>{c.signed_name}</dd></div>
                <div><dt className="text-xs text-muted">Documento</dt><dd>{c.signed_document}</dd></div>
                <div><dt className="text-xs text-muted">Data e hora</dt><dd>{dateTimeBR(c.signed_at)}</dd></div>
                <div><dt className="text-xs text-muted">IP</dt><dd>{c.signed_ip ?? '—'}</dd></div>
                <div><dt className="text-xs text-muted">Hash SHA-256 do texto</dt><dd className="break-all font-mono text-xs">{c.body_hash}</dd></div>
              </dl>
            </Section>
          )}
          {c.status === 'enviado' && <Section title="Aguardando assinatura"><p className="text-sm text-muted">Enviado em {dateTimeBR(c.sent_at)}. Link: <span className="break-all">{APP_URL}/c/{c.token}</span></p></Section>}
          {c.proposal_id && <Link href={`/propostas/${c.proposal_id}`} className="btn w-full">Ver proposta de origem</Link>}
          {open && c.status !== 'cancelado' && c.status !== 'rascunho' && <form action={cancelContract.bind(null, id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Cancelar este contrato? Esta ação não pode ser desfeita.">Cancelar contrato</SubmitButton></form>}
        </div>
      </div>
    </>
  );
}
