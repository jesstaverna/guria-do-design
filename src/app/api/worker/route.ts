import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const a = Buffer.from(got), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Varredura de automações (alertas de atraso, recorrências, propostas vencidas, CPL...) para TODOS os workspaces.
 * Acionada por agendador externo (Vercel Cron, pg_cron+pg_net, n8n) — funciona sem navegador aberto. Idempotente.
 */
async function handle(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { data, error } = await createAdminClient().rpc('run_scheduled_scans');
  if (error) {
    console.error('[worker] falha', error.message);
    return NextResponse.json({ ok: false, error: 'worker_failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...(data as object) });
}
export const GET = handle;   // Vercel Cron usa GET
export const POST = handle;
