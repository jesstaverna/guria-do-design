import { PageHeader } from '@/components/ui';
import { requireWorkspace } from '@/lib/session';
import { ClientForm } from '../ClientForm';
import { createClientAction } from '../actions';

export const metadata = { title: 'Novo cliente' };
export default async function NovoCliente() {
  await requireWorkspace('clientes');
  return (<><PageHeader title="Novo cliente" /><ClientForm action={createClientAction} /></>);
}
