// Regras puras de anexos (testadas em attachments.test.ts).
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const BLOCKED_EXT = new Set(['html', 'htm', 'svg', 'js', 'mjs', 'exe', 'bat', 'cmd', 'sh', 'msi', 'scr', 'com', 'jar', 'php']);

export function validateFile(name: string, size: number): string | null {
  if (!name.trim()) return 'Arquivo sem nome.';
  if (size <= 0) return 'Arquivo vazio.';
  if (size > MAX_ATTACHMENT_BYTES) return 'O arquivo passa de 25 MB. Envie um link (Google Drive) para arquivos grandes.';
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (BLOCKED_EXT.has(ext)) return `Arquivos .${ext} não são permitidos por segurança.`;
  return null;
}

/** Nome seguro para o caminho no storage (sem pastas, acentos ou caracteres estranhos). */
export function safeFileName(name: string) {
  const clean = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(-100);
  return clean || 'arquivo';
}

export type LinkProvider = 'google_drive' | 'outro';

/** Aceita só http(s). Reconhece Google Drive/Docs/Sheets/Slides. */
export function parseLink(raw: string): { url: string; provider: LinkProvider; host: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const drive = /(^|\.)(drive|docs)\.google\.com$/.test(u.hostname);
  return { url: u.toString(), provider: drive ? 'google_drive' : 'outro', host: u.hostname.replace(/^www\./, '') };
}

export function formatBytes(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  return `${(v / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
