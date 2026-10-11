'use client';
import { useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { google?: any; gapi?: any } }

const load = (src: string) => new Promise<void>((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = document.createElement('script'); s.src = src; s.async = true; s.onload = () => resolve(); s.onerror = () => reject(new Error(src)); document.head.appendChild(s);
});

/**
 * Seletor oficial do Google Drive (Google Picker). Só aparece se NEXT_PUBLIC_GOOGLE_CLIENT_ID e NEXT_PUBLIC_GOOGLE_API_KEY estiverem
 * configurados (ver docs/GOOGLE-DRIVE.md). Escopo mínimo: drive.file. O arquivo escolhido vira um LINK anexado à tarefa (nada é copiado).
 */
export function DrivePicker({ onPick }: { onPick: (file: { name: string; url: string }) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!clientId || !apiKey) return null;

  async function open() {
    setBusy(true); setErr(null);
    try {
      await Promise.all([load('https://apis.google.com/js/api.js'), load('https://accounts.google.com/gsi/client')]);
      await new Promise<void>((res) => window.gapi.load('picker', { callback: () => res() }));
      const token: string = await new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId, scope: 'https://www.googleapis.com/auth/drive.file',
          callback: (r: any) => (r.access_token ? resolve(r.access_token) : reject(new Error(r.error ?? 'sem token'))),
          error_callback: (e: any) => reject(new Error(e?.type ?? 'cancelado')),
        });
        client.requestAccessToken();
      });
      const g = window.google.picker;
      const picker = new g.PickerBuilder()
        .addView(new g.DocsView(g.ViewId.DOCS).setIncludeFolders(true))
        .addView(g.ViewId.RECENTLY_PICKED)
        .setOAuthToken(token).setDeveloperKey(apiKey)
        .setCallback((d: any) => { if (d.action === g.Action.PICKED && d.docs?.[0]) onPick({ name: d.docs[0].name, url: d.docs[0].url }); })
        .build();
      picker.setVisible(true);
    } catch (e) { setErr(`Não foi possível abrir o Google Drive (${(e as Error).message}).`); }
    setBusy(false);
  }

  return (
    <div>
      <button type="button" onClick={open} disabled={busy} className="btn">{busy ? 'Abrindo…' : 'Escolher no Google Drive'}</button>
      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}
    </div>
  );
}
