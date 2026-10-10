import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';
import { PostForm } from '../PostForm';
import { deletePost, updatePost } from '../actions';

export const metadata = { title: 'Conteúdo' };

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws, open } = await requireWorkspace('conteudo');
  const { data: p } = await supabase.from('content_posts').select('*').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const [{ data: clients }, { data: pillars }, { data: members }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('content_pillars').select('id, name').eq('workspace_id', ws.id).order('name'),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
  ]);
  return (
    <>
      <PageHeader title={p.title} />
      <fieldset disabled={!open}><PostForm action={updatePost.bind(null, id)} p={p} clients={clients ?? []} pillars={pillars ?? []} members={(members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }))} /></fieldset>
      {open && <form action={deletePost.bind(null, id)} className="mt-4"><SubmitButton className="text-xs text-danger underline" pendingText="…" confirm="Excluir este conteúdo?">Excluir</SubmitButton></form>}
    </>
  );
}
