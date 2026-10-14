import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PillarLite, PostLite } from '@/lib/content';

export const POST_COLS = 'id, title, kanban_pos, hook, format, network, status, bucket, publish_date, pillar_id, priority, assignee_id, keyword, category, review_required, published_at, cards_count, has_caption, has_prompt, has_manychat, manually_edited_at';

export interface Campaign { id: string; name: string; period: string | null; kind: string | null; status: string | null; notes: string | null; active: boolean }
export interface Member { id: string; name: string }

/** Carrega, de uma vez, tudo que as telas do módulo precisam (os mesmos registros alimentam pilares, calendário, Kanban e painel). */
export async function loadContent(supabase: SupabaseClient, wsId: string) {
  const [posts, pillars, campaigns, links, members, atts] = await Promise.all([
    supabase.from('content_posts').select(POST_COLS).eq('workspace_id', wsId).order('publish_date', { nullsFirst: false }).order('title').limit(2000),
    supabase.from('content_pillars').select('id, name, color, position, active, description, objective, external_id, manually_edited_at').eq('workspace_id', wsId).order('position').order('name'),
    supabase.from('content_campaigns').select('id, name, period, kind, status, notes, active').eq('workspace_id', wsId).order('name'),
    supabase.from('content_post_campaigns').select('post_id, campaign_id').eq('workspace_id', wsId).limit(10000),
    supabase.from('workspace_members').select('user_id, profile:profiles(full_name)').eq('workspace_id', wsId).eq('active', true),
    supabase.from('content_attachments').select('post_id').eq('workspace_id', wsId).limit(10000),
  ]);
  const linkMap = new Map<string, string[]>();
  (links.data ?? []).forEach((l) => linkMap.set(l.post_id, [...(linkMap.get(l.post_id) ?? []), l.campaign_id]));
  const attMap = new Map<string, number>();
  (atts.data ?? []).forEach((a) => attMap.set(a.post_id, (attMap.get(a.post_id) ?? 0) + 1));
  return {
    posts: (posts.data ?? []) as PostLite[],
    pillars: (pillars.data ?? []) as (PillarLite & { external_id: string | null; manually_edited_at: string | null })[],
    campaigns: (campaigns.data ?? []) as Campaign[],
    links: linkMap, attachments: attMap,
    members: (members.data ?? []).map((m) => ({ id: m.user_id as string, name: (m.profile as unknown as { full_name: string } | null)?.full_name ?? '—' })) as Member[],
  };
}
