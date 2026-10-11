import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = 'branding';
export const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Valida arquivo de imagem (PNG/JPEG/WebP até 2 MB) conferindo também os bytes iniciais (não confia só no tipo declarado). */
export async function readImage(file: FormDataEntryValue | null): Promise<{ ok: true; bytes: ArrayBuffer; type: string; ext: string } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Escolha uma imagem.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'A imagem passa de 2 MB. Reduza e tente de novo.' };
  const bytes = await file.arrayBuffer();
  const h = new Uint8Array(bytes.slice(0, 12));
  const png = h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47;
  const jpg = h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;
  const webp = h[0] === 0x52 && h[1] === 0x49 && h[2] === 0x46 && h[3] === 0x46 && h[8] === 0x57 && h[9] === 0x45 && h[10] === 0x42 && h[11] === 0x50;
  const type = png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : null;
  if (!type || !(type in TYPES)) return { ok: false, error: 'Formato não suportado. Use PNG, JPG ou WebP.' };
  return { ok: true, bytes, type, ext: TYPES[type] };
}

/** Envia para o bucket e devolve a URL pública. O nome leva timestamp para evitar cache da imagem antiga. */
export async function uploadPublic(supabase: SupabaseClient, folder: string, prefix: string, img: { bytes: ArrayBuffer; type: string; ext: string }) {
  const path = `${folder}/${prefix}-${Date.now()}.${img.ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, img.bytes, { contentType: img.type, upsert: false, cacheControl: '31536000' });
  if (error) return { error: error.message, url: null, path: null };
  return { error: null, url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, path };
}

/** Remove (sem falhar) o arquivo antigo, se a URL apontar para o nosso bucket. */
export async function removeByUrl(supabase: SupabaseClient, url: string | null | undefined) {
  const marker = `/object/public/${BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  if (!url || i < 0) return;
  await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marker.length).split('?')[0])]).catch(() => undefined);
}
