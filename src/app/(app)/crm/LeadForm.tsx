import { Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { centsToInput } from '@/lib/format';

export interface LeadRow {
  name?: string; company?: string | null; email?: string | null; phone?: string | null; source?: string | null; service_interest?: string | null;
  potential_value_cents?: number; stage_id?: string; owner_id?: string | null; notes?: string | null; next_action?: string | null; next_action_at?: string | null; lost_reason?: string | null;
}

export function LeadForm({ action, stages, members, l = {} }: {
  action: (fd: FormData) => Promise<void>; stages: { id: string; name: string }[]; members: { id: string; name: string }[]; l?: LeadRow;
}) {
  const nextAt = l.next_action_at ? new Date(l.next_action_at).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16).replace(' ', 'T') : '';
  return (
    <form action={action} className="card grid gap-4 sm:grid-cols-2">
      <Field label="Nome *"><input name="name" required defaultValue={l.name} className="input" /></Field>
      <Field label="Empresa / marca"><input name="company" defaultValue={l.company ?? ''} className="input" /></Field>
      <Field label="E-mail"><input name="email" type="email" defaultValue={l.email ?? ''} className="input" /></Field>
      <Field label="Telefone / WhatsApp"><input name="phone" defaultValue={l.phone ?? ''} className="input" /></Field>
      <Field label="Origem"><input name="source" defaultValue={l.source ?? ''} list="sources" className="input" placeholder="Instagram, indicação, site…" /><datalist id="sources">{['Instagram', 'Indicação', 'Site', 'WhatsApp', 'LinkedIn', 'Anúncio', 'Evento'].map((s) => <option key={s} value={s} />)}</datalist></Field>
      <Field label="Serviço de interesse"><input name="service_interest" defaultValue={l.service_interest ?? ''} className="input" placeholder="Identidade visual, social media…" /></Field>
      <Field label="Valor potencial (R$)"><input name="potential_value" inputMode="decimal" defaultValue={l.potential_value_cents ? centsToInput(l.potential_value_cents) : ''} className="input" placeholder="0,00" /></Field>
      <Field label="Etapa *"><select name="stage_id" required defaultValue={l.stage_id ?? stages[0]?.id} className="input">{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Responsável"><select name="owner_id" defaultValue={l.owner_id ?? ''} className="input"><option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Próxima ação"><input name="next_action" defaultValue={l.next_action ?? ''} className="input" placeholder="Enviar proposta, ligar…" /></Field>
      <Field label="Quando"><input name="next_action_at" type="datetime-local" defaultValue={nextAt} className="input" /></Field>
      <Field label="Motivo da perda" hint="Obrigatório ao mover para “Não fechado”."><input name="lost_reason" defaultValue={l.lost_reason ?? ''} className="input" /></Field>
      <Field label="Observações" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={l.notes ?? ''} className="input" /></Field>
      <div className="sm:col-span-2"><SubmitButton>Salvar lead</SubmitButton></div>
    </form>
  );
}
