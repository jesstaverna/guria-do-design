import { Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FORMATS, NETWORKS, POST_STATUS } from '@/lib/domain';

export interface PostRow {
  title?: string; network?: string; format?: string; status?: string; client_id?: string | null; pillar_id?: string | null; assignee_id?: string | null;
  publish_date?: string | null; hook?: string | null; caption?: string | null; cta?: string | null; hashtags?: string | null; visual_notes?: string | null; post_url?: string | null;
}
interface Opt { id: string; name: string }

export function PostForm({ action, p = {}, clients, pillars, members, defaults }: { action: (fd: FormData) => Promise<void>; p?: PostRow; clients: Opt[]; pillars: Opt[]; members: Opt[]; defaults?: { date?: string; client?: string; network?: string } }) {
  return (
    <form action={action} className="card grid gap-4 sm:grid-cols-3">
      <Field label="Título / tema *" className="sm:col-span-3"><input name="title" required defaultValue={p.title} className="input" /></Field>
      <Field label="Rede social"><select name="network" defaultValue={p.network ?? defaults?.network ?? 'instagram'} className="input">{Object.entries(NETWORKS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
      <Field label="Formato"><select name="format" defaultValue={p.format ?? 'feed'} className="input">{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Etapa"><select name="status" defaultValue={p.status ?? 'ideia'} className="input">{POST_STATUS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
      <Field label="Data de publicação"><input name="publish_date" type="date" defaultValue={p.publish_date ?? defaults?.date ?? ''} className="input" /></Field>
      <Field label="Cliente" hint="Vazio = perfil próprio."><select name="client_id" defaultValue={p.client_id ?? defaults?.client ?? ''} className="input"><option value="">— Próprio —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Pilar de conteúdo"><select name="pillar_id" defaultValue={p.pillar_id ?? ''} className="input"><option value="">—</option>{pillars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Responsável"><select name="assignee_id" defaultValue={p.assignee_id ?? ''} className="input"><option value="">—</option>{members.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Gancho (primeira frase / 3 primeiros segundos)" className="sm:col-span-3"><input name="hook" defaultValue={p.hook ?? ''} className="input" /></Field>
      <Field label="Legenda / roteiro" className="sm:col-span-3"><textarea name="caption" rows={6} defaultValue={p.caption ?? ''} className="input" /></Field>
      <Field label="CTA"><input name="cta" defaultValue={p.cta ?? ''} className="input" /></Field>
      <Field label="Hashtags" className="sm:col-span-2"><input name="hashtags" defaultValue={p.hashtags ?? ''} className="input" /></Field>
      <Field label="Direção visual / referências" className="sm:col-span-3"><textarea name="visual_notes" rows={3} defaultValue={p.visual_notes ?? ''} className="input" /></Field>
      <Field label="Link da publicação" className="sm:col-span-3" hint="Preencha depois de publicar."><input name="post_url" type="url" defaultValue={p.post_url ?? ''} className="input" /></Field>
      <div className="sm:col-span-3"><SubmitButton>Salvar conteúdo</SubmitButton></div>
    </form>
  );
}
