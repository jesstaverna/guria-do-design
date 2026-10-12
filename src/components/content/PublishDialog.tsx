'use client';
import { useEffect, useRef, useState } from 'react';

const nowLocal = () => new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 16).replace(' ', 'T');

/** Confirmação obrigatória para marcar como PUBLICADO: data/hora reais + confirmação explícita (nunca inferido da data editorial). */
export function PublishDialog({ open, title, onCancel, onConfirm }: { open: boolean; title: string; onCancel: () => void; onConfirm: (isoPublishedAt: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [when, setWhen] = useState(nowLocal());
  const [ok, setOk] = useState(false);
  useEffect(() => { const d = ref.current; if (!d) return; if (open && !d.open) { setWhen(nowLocal()); setOk(false); d.showModal(); } if (!open && d.open) d.close(); }, [open]);
  return (
    <dialog ref={ref} onClose={onCancel} className="w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-6 text-fg backdrop:bg-black/50">
      <h2 className="text-lg font-semibold">Confirmar publicação</h2>
      <p className="mt-1 text-sm text-muted">“{title}”. Marque como publicado só depois que o conteúdo estiver realmente no ar.</p>
      <label className="label mt-4">Data e hora reais da publicação</label>
      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input" max={nowLocal()} />
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />Confirmo que este conteúdo foi publicado.</label>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!ok || !when} onClick={() => onConfirm(new Date(`${when}:00-03:00`).toISOString())}>Marcar como publicado</button>
      </div>
    </dialog>
  );
}
