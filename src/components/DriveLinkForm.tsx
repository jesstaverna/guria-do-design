'use client';
import { useRef } from 'react';
import { DrivePicker } from './DrivePicker';
import { SubmitButton } from './SubmitButton';

/** Formulário de link (Drive/Figma/Canva/etc.) + seletor oficial do Drive quando configurado. */
export function DriveLinkForm({ action }: { action: (fd: FormData) => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  const fill = (name: string, url: string, provider: string) => {
    const f = form.current!; (f.elements.namedItem('url') as HTMLInputElement).value = url; (f.elements.namedItem('name') as HTMLInputElement).value = name;
    (f.elements.namedItem('provider') as HTMLInputElement).value = provider; f.requestSubmit();
  };
  return (
    <div className="space-y-3">
      <form ref={form} action={action} className="grid gap-2 sm:grid-cols-5">
        <input type="hidden" name="provider" defaultValue="" />
        <input name="url" required type="url" placeholder="Cole o link (Google Drive, Figma, Canva…)" className="input sm:col-span-3" aria-label="Link" />
        <input name="name" placeholder="Nome (opcional)" className="input sm:col-span-1" aria-label="Nome do link" />
        <SubmitButton className="btn btn-primary" pendingText="…">Anexar link</SubmitButton>
      </form>
      <DrivePicker onPick={(f) => fill(f.name, f.url, 'google_drive')} />
    </div>
  );
}
