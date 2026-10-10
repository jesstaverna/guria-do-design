import { Field } from '@/components/ui';
import { SubmitButton } from '@/components/SubmitButton';

export interface ClientRow {
  id?: string; name?: string; company?: string | null; email?: string | null; phone?: string | null; document?: string | null; address?: string | null;
  city?: string | null; segment?: string | null; instagram?: string | null; website?: string | null; status?: string; notes?: string | null;
}

export function ClientForm({ action, c = {} }: { action: (fd: FormData) => Promise<void>; c?: ClientRow }) {
  return (
    <form action={action} className="card grid gap-4 sm:grid-cols-2">
      <Field label="Nome do cliente *"><input name="name" required defaultValue={c.name} className="input" /></Field>
      <Field label="Empresa / marca"><input name="company" defaultValue={c.company ?? ''} className="input" /></Field>
      <Field label="E-mail"><input name="email" type="email" defaultValue={c.email ?? ''} className="input" /></Field>
      <Field label="Telefone / WhatsApp"><input name="phone" defaultValue={c.phone ?? ''} className="input" /></Field>
      <Field label="CPF / CNPJ" hint="Usado no contrato."><input name="document" defaultValue={c.document ?? ''} className="input" /></Field>
      <Field label="Segmento"><input name="segment" defaultValue={c.segment ?? ''} className="input" placeholder="Ex.: estética, advocacia, moda" /></Field>
      <Field label="Endereço" className="sm:col-span-2" hint="Usado no contrato."><input name="address" defaultValue={c.address ?? ''} className="input" /></Field>
      <Field label="Cidade / UF"><input name="city" defaultValue={c.city ?? ''} className="input" /></Field>
      <Field label="Instagram"><input name="instagram" defaultValue={c.instagram ?? ''} className="input" placeholder="@perfil" /></Field>
      <Field label="Site"><input name="website" defaultValue={c.website ?? ''} className="input" /></Field>
      <Field label="Status">
        <select name="status" defaultValue={c.status ?? 'ativo'} className="input"><option value="ativo">Ativo</option><option value="pausado">Pausado</option><option value="encerrado">Encerrado</option></select>
      </Field>
      <Field label="Observações" className="sm:col-span-2"><textarea name="notes" rows={3} defaultValue={c.notes ?? ''} className="input" /></Field>
      <div className="sm:col-span-2"><SubmitButton>Salvar cliente</SubmitButton></div>
    </form>
  );
}
