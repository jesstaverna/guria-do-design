'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { MAX_ATTACHMENT_BYTES } from '@/lib/attachments';

/** Serve para tarefas e conteúdos: recebe as ações (servidor) de preparar e registrar. Envio direto do navegador para o Supabase Storage (URL assinada), com suporte a vários arquivos e até 25 MB cada. */
type Prepare = (ownerId: string, fileName: string, size: number) => Promise<{ path: string; token: string } | { error: string }>;
type Register = (ownerId: string, path: string, name: string, size: number, mime: string) => Promise<{ ok: true } | { error: string }>;

export function AttachmentUploader({ taskId, prepare, register }: { taskId: string; prepare: Prepare; register: Register }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg(null);
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    let sent = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_ATTACHMENT_BYTES) { setMsg({ kind: 'err', text: `${file.name}: passa de 25 MB.` }); continue; }
      const prep = await prepare(taskId, file.name, file.size);
      if ('error' in prep) { setMsg({ kind: 'err', text: `${file.name}: ${prep.error}` }); continue; }
      const { error } = await supabase.storage.from('attachments').uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || 'application/octet-stream' });
      if (error) { setMsg({ kind: 'err', text: `${file.name}: falha no envio (${error.message}).` }); continue; }
      const reg = await register(taskId, prep.path, file.name, file.size, file.type);
      if ('error' in reg) { setMsg({ kind: 'err', text: `${file.name}: ${reg.error}` }); continue; }
      sent++;
    }
    if (input.current) input.current.value = '';
    setBusy(false);
    if (sent) { setMsg((m) => m ?? { kind: 'ok', text: `${sent} arquivo(s) anexado(s).` }); router.refresh(); }
  }

  return (
    <div>
      <label className={`btn cursor-pointer ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        {busy ? 'Enviando…' : 'Anexar arquivos'}
        <input ref={input} type="file" multiple className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files)} aria-label="Anexar arquivos" />
      </label>
      <span className="ml-3 text-xs text-muted">Até 25 MB cada. Arquivos maiores: use um link do Google Drive.</span>
      {msg && <p role={msg.kind === 'err' ? 'alert' : 'status'} className={`mt-2 text-sm ${msg.kind === 'err' ? 'text-danger' : 'text-ok'}`}>{msg.text}</p>}
    </div>
  );
}
