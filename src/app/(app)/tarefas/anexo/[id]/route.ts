import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { parseLink } from '@/lib/attachments';

/** Abre um anexo: arquivo → URL assinada de 60 s (download); link → redireciona (somente http/https). Respeita RLS do estúdio. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s?.current || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL('/login', req.url));
  const supabase = await createClient();
  const { data: a } = await supabase.from('task_attachments').select('kind, name, url, path').eq('id', id).eq('workspace_id', s.current.workspace.id).maybeSingle();
  if (!a) return new NextResponse('Anexo não encontrado', { status: 404 });
  if (a.kind === 'link') {
    const link = parseLink(a.url ?? '');
    return link ? NextResponse.redirect(link.url) : new NextResponse('Link inválido', { status: 400 });
  }
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(a.path!, 60, { download: a.name });
  if (error || !data) return new NextResponse('Não foi possível abrir o arquivo', { status: 502 });
  return NextResponse.redirect(data.signedUrl);
}
