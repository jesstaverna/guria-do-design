export type ModuleKey =
  | 'dashboard' | 'crm' | 'clientes' | 'propostas' | 'contratos' | 'projetos' | 'tarefas' | 'agenda' | 'conteudo' | 'trafego'
  | 'financeiro' | 'planejamento' | 'equipe' | 'configuracoes' | 'plano' | 'plataforma';

export interface ModuleDef { key: ModuleKey; label: string; href: string; icon: string; group: string; adminOnly?: boolean }

export const MODULES: ModuleDef[] = [
  { key: 'dashboard', label: 'Painel', href: '/dashboard', icon: 'layout-dashboard', group: 'Visão geral' },
  { key: 'agenda', label: 'Agenda e prazos', href: '/agenda', icon: 'calendar', group: 'Visão geral' },
  { key: 'crm', label: 'CRM', href: '/crm', icon: 'kanban', group: 'Comercial' },
  { key: 'clientes', label: 'Clientes', href: '/clientes', icon: 'users', group: 'Comercial' },
  { key: 'propostas', label: 'Propostas', href: '/propostas', icon: 'file-text', group: 'Comercial' },
  { key: 'contratos', label: 'Contratos', href: '/contratos', icon: 'file-signature', group: 'Comercial' },
  { key: 'projetos', label: 'Projetos', href: '/projetos', icon: 'folder-kanban', group: 'Produção' },
  { key: 'tarefas', label: 'Tarefas', href: '/tarefas', icon: 'list-checks', group: 'Produção' },
  { key: 'conteudo', label: 'Conteúdo', href: '/conteudo', icon: 'share-2', group: 'Produção' },
  { key: 'trafego', label: 'Tráfego pago', href: '/trafego', icon: 'megaphone', group: 'Produção' },
  { key: 'financeiro', label: 'Financeiro', href: '/financeiro', icon: 'wallet', group: 'Dinheiro', adminOnly: true },
  { key: 'planejamento', label: 'Metas e planejamento', href: '/planejamento', icon: 'target', group: 'Dinheiro', adminOnly: true },
  { key: 'equipe', label: 'Equipe', href: '/equipe', icon: 'user-plus', group: 'Conta', adminOnly: true },
  { key: 'configuracoes', label: 'Configurações', href: '/configuracoes', icon: 'settings', group: 'Conta', adminOnly: true },
  { key: 'plano', label: 'Plano e cobrança', href: '/plano', icon: 'credit-card', group: 'Conta', adminOnly: true },
  // Só aparece para quem está em platform_admins (ver layout). A página valida de novo no servidor.
  { key: 'plataforma', label: 'Plataforma (master)', href: '/plataforma', icon: 'shield', group: 'Conta', adminOnly: true },
];

export const ROLE_LABEL: Record<string, string> = { owner: 'Titular', admin: 'Administrador', member: 'Equipe' };
export const isAdminRole = (role: string) => role === 'owner' || role === 'admin';
export const canAccess = (role: string, key: ModuleKey) => !MODULES.find((m) => m.key === key)?.adminOnly || isAdminRole(role);
