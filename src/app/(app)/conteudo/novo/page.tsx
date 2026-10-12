import { requireWorkspace } from '@/lib/session';
import { loadContent } from '@/lib/content-data';
import { Field, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { FORMATS, NETWORKS } from '@/lib/domain';
import { createPost } from '../actions';

export const metadata = { title: 'Novo conteúdo' };

export default async function NovoPost({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase, ws } = await requireWorkspace('conteudo');
  const sp = await searchParams;
  const { pillars } = await loadContent(supabase, ws.id);
  const { data: clients } = await supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500);
  return (
    <>
      <PageHeader title="Novo conteúdo" subtitle="Crie o registro básico; cards, legenda, prompt e ManyChat são editados no detalhe." />
      <form action={createPost} className="card grid gap-4 sm:grid-cols-3">
        <Field label="Título / tema *" className="sm:col-span-3"><input name="title" required minLength={2} className="input" /></Field>
        <Field label="Pilar"><select name="pillar_id" className="input"><option value="">—</option>{pillars.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Rede social"><select name="network" className="input">{Object.entries(NETWORKS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Formato"><select name="format" defaultValue="carrossel" className="input">{Object.entries(FORMATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Data editorial (opcional)" hint="Sem data, o conteúdo fica nas ideias."><input name="publish_date" type="date" defaultValue={sp.date ?? ''} className="input" /></Field>
        <Field label="Palavra-chave"><input name="keyword" className="input" /></Field>
        <Field label="Cliente (opcional)"><select name="client_id" className="input"><option value="">— Próprio —</option>{clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <div className="sm:col-span-3"><SubmitButton pendingText="…">Criar conteúdo</SubmitButton></div>
      </form>
    </>
  );
}
