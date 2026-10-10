import { Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { AD_OBJECTIVES, AD_PLATFORMS } from '@/lib/domain';
import { centsToInput } from '@/lib/format';

export interface CampaignRow { name?: string; client_id?: string | null; platform?: string; objective?: string | null; status?: string; daily_budget_cents?: number; target_cpl_cents?: number | null; start_date?: string | null; end_date?: string | null; notes?: string | null }

export function CampaignForm({ action, c = {}, clients, label = 'Salvar campanha', defaultClient }: { action: (fd: FormData) => Promise<void>; c?: CampaignRow; clients: { id: string; name: string }[]; label?: string; defaultClient?: string }) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <Field label="Nome da campanha *" className="sm:col-span-2"><input name="name" required defaultValue={c.name} className="input" /></Field>
      <Field label="Cliente"><select name="client_id" defaultValue={c.client_id ?? defaultClient ?? ''} className="input"><option value="">— Próprio —</option>{clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
      <Field label="Plataforma"><select name="platform" defaultValue={c.platform ?? 'meta'} className="input">{Object.entries(AD_PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Objetivo"><select name="objective" defaultValue={c.objective ?? 'leads'} className="input">{Object.entries(AD_OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Status"><select name="status" defaultValue={c.status ?? 'ativa'} className="input"><option value="planejada">Planejada</option><option value="ativa">Ativa</option><option value="pausada">Pausada</option><option value="encerrada">Encerrada</option></select></Field>
      <Field label="Orçamento diário (R$)"><input name="daily_budget" inputMode="decimal" defaultValue={c.daily_budget_cents ? centsToInput(c.daily_budget_cents) : ''} className="input" /></Field>
      <Field label="Meta de CPL (R$)" hint="Gera alerta se o custo por lead passar disso."><input name="target_cpl" inputMode="decimal" defaultValue={c.target_cpl_cents ? centsToInput(c.target_cpl_cents) : ''} className="input" /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Início"><input name="start_date" type="date" defaultValue={c.start_date ?? ''} className="input" /></Field><Field label="Fim"><input name="end_date" type="date" defaultValue={c.end_date ?? ''} className="input" /></Field></div>
      <Field label="Observações" className="sm:col-span-3"><textarea name="notes" rows={2} defaultValue={c.notes ?? ''} className="input" /></Field>
      <div className="sm:col-span-3"><SubmitButton pendingText="…">{label}</SubmitButton></div>
    </form>
  );
}
