import {
  Activity, AlarmClock, AlertCircle, AlertTriangle, BarChart3, Bell, CalendarCheck, CalendarClock, CalendarDays, CheckCircle2, Coins, Filter, Flag,
  Gauge, History, Info, Lightbulb, LineChart, Link2, Mail, MousePointerClick, Paperclip, PiggyBank, Percent, PieChart, Receipt, Repeat, Rocket,
  Send, Sparkles, TrendingUp, Upload, Layers,
  Calendar, CreditCard, FolderKanban, Kanban, LayoutDashboard, ListChecks, Megaphone, FileSignature, FileText, Settings, Share2, Target,
  ShieldCheck, UserPlus, Users, Wallet, Radar, type LucideIcon,
} from 'lucide-react';

const MAP: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard, kanban: Kanban, 'file-text': FileText, 'file-signature': FileSignature, users: Users,
  'list-checks': ListChecks, calendar: Calendar, wallet: Wallet, target: Target, settings: Settings, 'folder-kanban': FolderKanban,
  'share-2': Share2, megaphone: Megaphone, 'user-plus': UserPlus, 'credit-card': CreditCard, shield: ShieldCheck, radar: Radar,
};

export function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: string; className?: string }) {
  const C = MAP[name] ?? LayoutDashboard;
  return <C className={className} strokeWidth={1.6} aria-hidden />;
}

/** Ícone sugerido a partir do texto de um título/rótulo (cartões de números e seções). */
const RULES: [RegExp, LucideIcon][] = [
  [/em atraso|atrasad/i, AlertTriangle], [/lucro|saldo|diferença/i, TrendingUp], [/a receber|a pagar|caixa|previs/i, CalendarClock],
  [/^pago|despesa/i, Receipt], [/recebido|faturar|entradas|investimento|orçamento/i, Wallet], [/mrr|receita/i, Coins],
  [/leads|prospect|contatados|responderam|viraram/i, UserPlus], [/pipeline|funil|negocia/i, Filter],
  [/proposta|aceit/i, FileText], [/contrato|assinatura|evidências/i, FileSignature],
  [/prazo|agenda|próximos 7|próximos dias/i, CalendarDays], [/tarefa/i, ListChecks], [/post|conteúdo|editorial|publicad|roteiro|stories|reels|pilar|acervo|planejados/i, Share2],
  [/tráfego|campanha|cliques|ctr|cpl|roas/i, Megaphone], [/meta|planejamento|progresso/i, Target],
  [/alerta/i, Bell], [/onboarding|projeto|andamento|produção|etapa/i, FolderKanban], [/histórico|atividade|follow/i, History],
  [/cliente|equipe|pessoa|perfil/i, Users], [/importar|importações/i, Upload], [/anexo|criativo|logotipo|avatar/i, Paperclip],
  [/dica|como funciona|próximos passos/i, Lightbulb], [/plano|uso/i, Gauge], [/vari[aá]veis|verifica/i, Layers],
];
export function iconFor(text: string): LucideIcon | null {
  for (const [re, C] of RULES) if (re.test(text)) return C;
  return null;
}
export function hasIcon(text: string, icon?: string) { return icon ? !!MAP[icon] : !!iconFor(text); }
export function AutoIcon({ text, icon, className = 'h-4 w-4' }: { text: string; icon?: string; className?: string }) {
  const C = icon ? MAP[icon] ?? null : iconFor(text);
  return C ? <C className={className} strokeWidth={1.7} aria-hidden /> : null;
}
export const SeverityIcon = { critical: AlertTriangle, warning: AlertCircle, info: Info } as const;
export { CheckCircle2, ListChecks, Megaphone, Sparkles, Rocket, Send, Flag, Link2, Mail, Activity, BarChart3, Repeat, CalendarCheck, LineChart, PieChart, PiggyBank, Percent, Receipt, MousePointerClick, AlarmClock };
