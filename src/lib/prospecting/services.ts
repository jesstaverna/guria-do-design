import type { ServiceKey } from './analysis';

/** Serviços de design que a pontuação pode sugerir para cada prospecto. */
export const SERVICE_LABEL: Record<ServiceKey, string> = {
  site_institucional: 'Site institucional',
  landing_page: 'Landing page',
  redes_sociais: 'Social media',
  trafego_pago: 'Tráfego pago',
  branding: 'Identidade visual',
  design_posts: 'Design de posts',
};

/** Link do WhatsApp (wa.me) para um telefone brasileiro; null se o número for inválido. */
export function whatsappLink(phone: string | null | undefined, text = ''): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  const n = d.startsWith('55') && d.length >= 12 ? d : d.length === 10 || d.length === 11 ? `55${d}` : '';
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const PROSPECT_STATUS: Record<string, { label: string; tone: string }> = {
  novo: { label: 'Novo', tone: 'bg-subtle text-muted' },
  analisado: { label: 'Analisado', tone: 'bg-accent/15 text-accent-ink' },
  contatado: { label: 'Contatado', tone: 'bg-warn/15 text-warn' },
  respondeu: { label: 'Respondeu', tone: 'bg-ok/15 text-ok' },
  descartado: { label: 'Descartado', tone: 'bg-subtle text-muted' },
  convertido: { label: 'Virou lead', tone: 'bg-ok/15 text-ok' },
};
