import { APP_URL } from '@/lib/brand';
import { requireWorkspace } from '@/lib/session';
import { Badge, Field, PageHeader, Section } from '@/components/ui';
import { CopyButton } from '@/components/ClientButtons';
import { SubmitButton } from '@/components/SubmitButton';
import { ROLE_LABEL } from '@/lib/permissions';
import { dateBR } from '@/lib/format';
import { Avatar } from '@/components/Avatar';
import { invite, removeMember, revokeInvite, setRole } from './actions';

export const metadata = { title: 'Equipe' };

export default async function Equipe() {
  const { supabase, ws, user, open } = await requireWorkspace('equipe');
  const [{ data: members }, { data: invites }, { data: plan }] = await Promise.all([
    supabase.from('workspace_members').select('id, user_id, role, created_at, profile:profiles(full_name, email, avatar_url)').eq('workspace_id', ws.id).eq('active', true).order('created_at'),
    supabase.from('workspace_invites').select('id, email, role, token, expires_at').eq('workspace_id', ws.id).is('accepted_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    supabase.from('plans').select('name, max_members').eq('key', ws.plan).single(),
  ]);
  const used = members?.length ?? 0;
  return (
    <>
      <PageHeader title="Equipe" subtitle={`${used} de ${plan?.max_members ?? '∞'} lugar(es) usados no plano ${plan?.name ?? ws.plan}.`} />
      <p className="mb-5 text-sm text-muted"><b>Administradores</b> veem tudo, inclusive financeiro, metas e configurações. <b>Equipe</b> acessa CRM, propostas, contratos, projetos, tarefas, conteúdo e tráfego, mas não o financeiro.</p>
      <div className="table-wrap mb-8"><table className="w-full"><thead><tr><th className="th">Pessoa</th><th className="th">Papel</th><th className="th">Desde</th><th className="th" /></tr></thead>
        <tbody className="divide-y divide-line">{members?.map((m) => {
          const p = m.profile as unknown as { full_name: string; email: string; avatar_url: string | null };
          return (<tr key={m.id}><td className="td"><div className="flex items-center gap-3"><Avatar url={p.avatar_url} name={p.full_name} size={32} /><div><div className="font-medium">{p.full_name}{m.user_id === user.id && <span className="ml-2 text-xs text-muted">(você)</span>}</div><div className="text-xs text-muted">{p.email}</div></div></div></td>
            <td className="td">{m.role === 'owner' ? <Badge>{ROLE_LABEL.owner}</Badge> : open ? (
              <form action={setRole.bind(null, m.id)} className="flex gap-2"><select name="role" defaultValue={m.role} className="input !w-auto !py-1.5"><option value="member">Equipe</option><option value="admin">Administrador</option></select><SubmitButton className="btn btn-sm" pendingText="…">Salvar</SubmitButton></form>) : <Badge>{ROLE_LABEL[m.role]}</Badge>}</td>
            <td className="td text-muted">{dateBR(m.created_at)}</td>
            <td className="td text-right">{m.role !== 'owner' && open && <form action={removeMember.bind(null, m.id)}><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm={`Remover ${p.full_name} do espaço?`}>Remover</SubmitButton></form>}</td></tr>);
        })}</tbody></table></div>
      {open && (
        <Section title="Convidar pessoa">
          <form action={invite} className="grid gap-3 sm:grid-cols-4"><Field label="E-mail" className="sm:col-span-2"><input name="email" type="email" required className="input" /></Field>
            <Field label="Papel"><select name="role" className="input"><option value="member">Equipe</option><option value="admin">Administrador</option></select></Field><div className="flex items-end"><SubmitButton pendingText="…">Gerar convite</SubmitButton></div></form>
          <p className="mt-2 text-xs text-muted">O convite vale por 7 dias e só funciona para o e-mail informado. Envie o link por WhatsApp ou e-mail.</p>
          {!!invites?.length && <ul className="mt-5 space-y-2 border-t border-line pt-4">{invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{i.email} <span className="text-muted">· {i.role === 'admin' ? 'Administrador' : 'Equipe'} · expira {dateBR(i.expires_at)}</span></span>
              <span className="flex gap-2"><CopyButton text={`${APP_URL}/convite/${i.token}`} label="Copiar link" /><form action={revokeInvite.bind(null, i.id)}><SubmitButton className="btn btn-sm" pendingText="…">Cancelar</SubmitButton></form></span></li>))}</ul>}
        </Section>
      )}
    </>
  );
}
