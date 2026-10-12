'use client';
import { useState, useTransition } from 'react';
import { setPostCampaigns } from '@/app/(app)/conteudo/actions';

/** Campanhas/editorias transversais (tags). Não são pilares: um conteúdo tem UM pilar e várias campanhas. */
export function CampaignPicker({ postId, campaigns, selected, disabled }: { postId: string; campaigns: { id: string; name: string }[]; selected: string[]; disabled?: boolean }) {
  const [sel, setSel] = useState<string[]>(selected);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const toggle = (id: string) => {
    const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
    setSel(next); setErr('');
    start(async () => { const r = await setPostCampaigns(postId, next); if ('error' in r) { setErr(r.error); setSel(sel); } });
  };
  if (!campaigns.length) return <p className="text-sm text-muted">Nenhuma campanha cadastrada (crie em Pilares).</p>;
  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Campanhas">
        {campaigns.map((c) => (
          <button key={c.id} type="button" disabled={disabled || pending} onClick={() => toggle(c.id)} aria-pressed={sel.includes(c.id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${sel.includes(c.id) ? 'border-transparent bg-accent text-on-accent' : 'border-line bg-surface hover:bg-subtle'}`}>{c.name}</button>
        ))}
      </div>
      {err && <p role="alert" className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}
