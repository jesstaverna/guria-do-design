import type { SupabaseClient } from '@supabase/supabase-js';

/** Início do mês corrente em America/Sao_Paulo (UTC-3, sem horário de verão), em ISO UTC. */
export function monthStartBRT(now = new Date()): string {
  const brt = new Date(now.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), 1, 3)).toISOString();
}

/** Buscas restantes no mês. `max` nulo = ilimitado (devolve Infinity). */
export function searchesLeft(max: number | null | undefined, used: number): number {
  return max == null ? Infinity : Math.max(0, max - used);
}

/** Cota mensal de buscas no Google Maps do estúdio (plano) e quanto já foi usado. */
export async function searchQuota(db: SupabaseClient, wsId: string) {
  const [{ data: w }, { count }] = await Promise.all([
    db.from('workspaces').select('plans(max_prospect_searches)').eq('id', wsId).maybeSingle(),
    db.from('prospect_searches').select('id', { count: 'exact', head: true }).eq('workspace_id', wsId).gte('created_at', monthStartBRT()),
  ]);
  const plan = Array.isArray(w?.plans) ? w?.plans[0] : w?.plans;
  const max = (plan as { max_prospect_searches: number | null } | null | undefined)?.max_prospect_searches ?? null;
  return { max, used: count ?? 0, left: searchesLeft(max, count ?? 0) };
}
