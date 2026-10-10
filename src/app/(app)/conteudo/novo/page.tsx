import { PageHeader } from '@/components/ui';
import { requireWorkspace } from '@/lib/session';
import { PostForm } from '../PostForm';
import { createPost } from '../actions';

export const metadata = { title: 'Novo conteúdo' };

export default async function NovoPost({ searchParams }: { searchParams: Promise<{ date?: string; client?: string; network?: string }> }) {
  const { supabase, ws } = await requireWorkspace('conteudo');
  const sp = await searchParams;
  const [{ data: clients }, { data: pillars }, { data: members }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('workspace_id', ws.id).order('name').limit(500),
    supabase.from('content_pillars').select('id, name').eq('workspace_id', ws.id).order('name'),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
  ]);
  return (<><PageHeader title="Novo conteúdo" /><PostForm action={createPost} clients={clients ?? []} pillars={pillars ?? []} members={(members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }))} defaults={sp} /></>);
}
