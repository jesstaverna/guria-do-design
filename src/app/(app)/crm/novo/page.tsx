import { PageHeader } from '@/components/ui';
import { requireWorkspace } from '@/lib/session';
import { LeadForm } from '../LeadForm';
import { createLead } from '../actions';

export const metadata = { title: 'Novo lead' };
export default async function NovoLead() {
  const { supabase, ws } = await requireWorkspace('crm');
  const [{ data: stages }, { data: members }] = await Promise.all([
    supabase.from('pipeline_stages').select('id, name').eq('workspace_id', ws.id).order('position'),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', ws.id).eq('active', true),
  ]);
  return (<><PageHeader title="Novo lead" /><LeadForm action={createLead} stages={stages ?? []} members={(members ?? []).map((m) => ({ id: m.user_id, name: (m.profile as unknown as { full_name: string }).full_name }))} /></>);
}
