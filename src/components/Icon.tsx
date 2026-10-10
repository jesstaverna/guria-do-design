import {
  Calendar, CreditCard, FolderKanban, Kanban, LayoutDashboard, ListChecks, Megaphone, FileSignature, FileText, Settings, Share2, Target,
  UserPlus, Users, Wallet, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, kanban: Kanban, 'file-text': FileText, 'file-signature': FileSignature, users: Users,
  'list-checks': ListChecks, calendar: Calendar, wallet: Wallet, target: Target, settings: Settings, 'folder-kanban': FolderKanban,
  'share-2': Share2, megaphone: Megaphone, 'user-plus': UserPlus, 'credit-card': CreditCard,
};

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: string; className?: string }) {
  const C = MAP[name] ?? LayoutDashboard;
  return <C className={className} strokeWidth={1.6} aria-hidden />;
}
