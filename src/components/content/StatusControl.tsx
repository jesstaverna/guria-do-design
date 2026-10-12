'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { movePostStage } from '@/app/(app)/conteudo/actions';
import { STAGES, type StageKey } from '@/lib/content';
import { PublishDialog } from './PublishDialog';

export function StatusControl({ postId, title, status, disabled }: { postId: string; title: string; status: StageKey; disabled?: boolean }) {
  const router = useRouter();
  const [cur, setCur] = useState<StageKey>(status);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  function go(stage: StageKey, opts?: { publishedAt?: string; confirmed?: boolean }) {
    const before = cur; setCur(stage); setMsg('');
    start(async () => { const r = await movePostStage(postId, stage, opts); if ('error' in r) { setMsg(r.error); setCur(before); } else { setMsg('Salvo ✓'); router.refresh(); } });
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between"><label htmlFor="stage" className="label !mb-0">Etapa de produção</label><span role="status" className={`text-[11px] ${msg.startsWith('Salvo') ? 'text-muted' : 'text-danger'}`}>{pending ? 'Salvando…' : msg}</span></div>
      <select id="stage" disabled={disabled} value={cur} onChange={(e) => { const s = e.target.value as StageKey; if (s === 'publicado') setAsk(true); else go(s); }} className="input">
        {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
      </select>
      <PublishDialog open={ask} title={title} onCancel={() => setAsk(false)} onConfirm={(iso) => { setAsk(false); go('publicado', { publishedAt: iso, confirmed: true }); }} />
    </div>
  );
}
