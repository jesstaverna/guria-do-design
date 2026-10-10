import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireWorkspace } from '@/lib/session';
import { PrintButton } from '@/components/ClientButtons';
import { ProposalView, type ProposalViewData } from '@/components/ProposalView';

export const metadata = { title: 'Pré-visualização da proposta' };

export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, ws } = await requireWorkspace('propostas');
  const { data: p } = await supabase.from('proposals').select('*, client:clients(name), lead:leads(name, company)').eq('id', id).eq('workspace_id', ws.id).maybeSingle();
  if (!p) notFound();
  const { data: items } = await supabase.from('proposal_items').select('name, description, billing, quantity, unit_price_cents').eq('proposal_id', id).order('position').order('id');
  const who = (p.client as { name: string } | null)?.name ?? (p.lead as { name: string; company: string | null } | null)?.company ?? (p.lead as { name: string } | null)?.name ?? null;
  const data: ProposalViewData = { ...p, client_name: who, items: items ?? [], brand: { name: ws.name, legal_name: ws.legal_name, document: ws.document, email: ws.email, phone: ws.phone, logo_url: ws.logo_url, color: ws.brand_color, instagram: ws.instagram, city: ws.city } };
  return (
    <div className="-mx-4 -mt-4 bg-subtle px-4 py-6 sm:-mx-6 lg:-mx-10">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between"><Link href={`/propostas/${id}`} className="btn btn-sm">← Voltar ao editor</Link><PrintButton label="Salvar como PDF" /></div>
      <ProposalView p={data} />
    </div>
  );
}
