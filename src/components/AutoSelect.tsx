'use client';

/** Select que envia o formulário ao mudar (ex.: mudar status de tarefa/post sem botão). */
export function AutoSelect({ action, name = 'status', defaultValue, options, label, className = 'input !py-1 text-xs' }: {
  action: (fd: FormData) => Promise<void>; name?: string; defaultValue: string; options: { value: string; label: string }[]; label: string; className?: string;
}) {
  return (
    <form action={action}>
      <label className="sr-only">{label}</label>
      <select name={name} defaultValue={defaultValue} className={className} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </form>
  );
}
