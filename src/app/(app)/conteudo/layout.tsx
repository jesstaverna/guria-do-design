import { requireWorkspace } from '@/lib/session';
import { ContentTabs } from '@/components/content/ContentTabs';

export default async function ContentLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin } = await requireWorkspace('conteudo');
  return (<><ContentTabs isAdmin={isAdmin} />{children}</>);
}
