import { headers } from 'next/headers';

/** URL pública do sistema para montar links de compartilhamento (proposta, contrato, convite, Espaço do Cliente).
 *  Usa NEXT_PUBLIC_APP_URL quando definida; senão, o domínio em que a página está sendo acessada — evita links com localhost. */
export async function appUrl(): Promise<string> {
  let env = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');
  if (env && !/^https?:\/\//i.test(env)) env = `https://${env}`; // aceita o domínio digitado sem https://
  if (env && !/localhost|127\.0\.0\.1/.test(env)) return env;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return env ?? 'http://localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}
