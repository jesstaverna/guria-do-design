import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { flash, requireWorkspace } from '@/lib/session';
import { Badge, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { dateBR, dateTimeBR } from '@/lib/format';

export const metadata = { title: 'Plataforma' };

/** Área de quem VENDE o sistema: lista todos os estúdios e gerencia plano/status/teste. Exige linha em platform_admins. */
async function guard() {
  const { user } = await requireWorkspace();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) notFound();
  const admin = createAdminClient();
  const { data } = await admin.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (!data) notFound();
  return admin;
}

async function update(id: string, fd: FormData) {
  'use server';
  const admin = await guard();
  const plan = String(fd.get('plan') ?? ''), status = String(fd.get('status') ?? '');
  const patch: Record<string, unknown> = {};
  if (['solo', 'studio', 'premium'].includes(plan)) patch.plan = plan;
  if (['trial', 'active', 'past_due', 'canceled'].includes(status)) patch.status = status;
  const extend = Number(fd.get('extend_days') ?? 0);
  if (extend > 0 && extend <= 365) patch.trial_ends_at = new Date(Date.now() + extend * 86_400_000).toISOString();
  const ref = String(fd.get('billing_ref') ?? '').trim();
  patch.billing_ref = ref || null;
  const { error } = await admin.from('workspaces').update(patch).eq('id', id);
  revalidatePath('/plataforma');
  flash('/plataforma', error ? 'err' : 'ok', error ? 'Não foi possível atualizar.' : 'Estúdio atualizado.');
}

export default async function Plataforma() {
  const admin = await guard();
  const [{ data: ws }, { data: members }, { data: profiles }] = await Promise.all([
    admin.from('workspaces').select('id, name, slug, plan, status, trial_ends_at, billing_ref, created_at, owner_id').order('created_at', { ascending: false }).limit(500),
    admin.from('workspace_members').select('workspace_id').eq('active', true),
    admin.from('profiles').select('id, full_name, email'),
  ]);
  const owners = new Map((profiles ?? []).map((p) => [p.id, p]));
  const count = new Map<string, number>();
  members?.forEach((m) => count.set(m.workspace_id, (count.get(m.workspace_id) ?? 0) + 1));
  const by = (s: string) => ws?.filter((w) => w.status === s).length ?? 0;
  return (
    <>
      <PageHeader title="Plataforma" subtitle={`${ws?.length ?? 0} estúdio(s) · ${by('active')} ativo(s) · ${by('trial')} em teste · ${by('past_due') + by('canceled')} inadimplente(s)/cancelado(s)`} />
      <div className="space-y-4">{ws?.map((w) => {
        const o = owners.get(w.owner_id);
        return (
          <form key={w.id} action={update.bind(null, w.id)} className="card grid gap-3 sm:grid-cols-6 sm:items-end">
            <div className="sm:col-span-2"><div className="font-medium">{w.name}</div><div className="text-xs text-muted">{o?.full_name} · {o?.email}</div><div className="text-xs text-muted">criado {dateBR(w.created_at)} · {count.get(w.id) ?? 0} pessoa(s) · teste até {dateTimeBR(w.trial_ends_at)}</div></div>
            <label className="text-xs">Plano<select name="plan" defaultValue={w.plan} className="input mt-1 !py-1.5"><option value="solo">Solo</option><option value="studio">Estúdio</option></select></label>
            <label className="text-xs">Status<select name="status" defaultValue={w.status} className="input mt-1 !py-1.5"><option value="trial">Teste</option><option value="active">Ativo</option><option value="past_due">Pendente</option><option value="canceled">Cancelado</option></select></label>
            <label className="text-xs">Estender teste (dias)<input name="extend_days" type="number" min={0} max={365} className="input mt-1 !py-1.5" /></label>
            <div className="flex items-center gap-2"><input name="billing_ref" defaultValue={w.billing_ref ?? ''} placeholder="ref. cobrança" className="input !py-1.5 text-xs" aria-label="Referência da cobrança" /><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton><Badge>{w.status}</Badge></div>
          </form>
        );
      })}</div>
      <p className="mt-6 text-xs text-muted">Para se tornar administrador da plataforma: <code>insert into platform_admins (user_id) values (&apos;&lt;uuid do usuário&gt;&apos;);</code> via SQL (service role).</p>
    </>
  );
}
