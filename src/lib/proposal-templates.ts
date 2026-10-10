// Modelos de proposta: estrutura persuasiva (diagnóstico → solução → escopo → investimento). Preços ficam em ZERO de propósito:
// o designer define os valores. Textos são sugestões editáveis.
export interface ProposalPreset {
  key: string; label: string; title: string;
  intro: string; diagnosis: string; scope: string; exclusions: string; timeline: string; payment_terms: string; closing: string;
  items: { name: string; description: string; billing: 'pontual' | 'mensal' }[];
}

const CLOSING = 'Cada projeto começa com escuta e termina com entrega profissional. Se esta proposta faz sentido para o seu momento, basta aceitá-la pelo botão abaixo e eu cuido dos próximos passos: contrato, cronograma e início.';
const PAY = 'Entrada de 50% na aprovação e 50% na entrega final, via Pix ou transferência. A produção começa após a confirmação da entrada.';

export const PROPOSAL_PRESETS: ProposalPreset[] = [
  {
    key: 'identidade', label: 'Identidade visual', title: 'Identidade visual',
    intro: 'Obrigada pela conversa e pela confiança. Esta proposta organiza o que entendi do seu projeto e como vamos transformá-lo em uma marca consistente e reconhecível.',
    diagnosis: 'Hoje a marca ainda não comunica com clareza quem você é, para quem fala e por que vale a pena escolher você. Isso gera ruído visual, dificulta a percepção de valor e exige mais esforço de venda.',
    scope: '• Briefing estratégico e análise de referências\n• Pesquisa de mercado e posicionamento visual\n• 3 propostas de paleta de cores e tipografia\n• Criação do logotipo (versões principal, secundária e símbolo)\n• Aplicações em mockups\n• Manual de marca resumido\n• Arquivos finais para impressão e web',
    exclusions: 'Registro da marca no INPI, impressão de materiais, criação de site e licenças de fontes comerciais não estão incluídos.',
    timeline: 'Semana 1: briefing e pesquisa • Semana 2: conceito e paleta • Semana 3: logotipo e ajustes • Semana 4: manual e entrega dos arquivos.',
    payment_terms: PAY, closing: CLOSING,
    items: [{ name: 'Identidade visual completa', description: 'Logotipo, paleta, tipografia e manual de marca', billing: 'pontual' }],
  },
  {
    key: 'social', label: 'Social media / conteúdo', title: 'Gestão de conteúdo para redes sociais',
    intro: 'Esta proposta descreve como vamos construir uma presença consistente nas redes sociais, com planejamento, design e rotina de publicação.',
    diagnosis: 'Sem planejamento, os posts ficam irregulares, sem linha editorial e sem relação com os objetivos do negócio. O resultado é alcance baixo e pouca percepção de autoridade.',
    scope: '• Planejamento editorial mensal com pilares de conteúdo\n• Criação de artes (feed, carrosséis e stories)\n• Legendas estratégicas e CTAs\n• Calendário de publicações com aprovação prévia\n• Relatório mensal de desempenho',
    exclusions: 'Captação de fotos e vídeos, edição de vídeo longo, gestão de anúncios pagos e atendimento de comentários/direct não estão incluídos, salvo se listados.',
    timeline: 'Planejamento entregue até o dia 25 do mês anterior • Aprovação em até 3 dias úteis • Publicações conforme calendário.',
    payment_terms: 'Mensalidade paga antecipadamente, todo dia 5, via Pix ou boleto.', closing: CLOSING,
    items: [{ name: 'Pacote mensal de social media', description: 'Planejamento + artes + legendas + relatório', billing: 'mensal' }],
  },
  {
    key: 'landing', label: 'Site / landing page', title: 'Design e desenvolvimento de landing page',
    intro: 'Vamos criar uma página pensada para uma única missão: converter visitantes em contatos ou clientes.',
    diagnosis: 'Páginas genéricas perdem o visitante em segundos. Falta clareza na promessa, prova de autoridade e um caminho óbvio até a ação.',
    scope: '• Estrutura e copy orientadas à conversão\n• Design responsivo (desktop e mobile)\n• Seções: promessa, benefícios, prova, FAQ e CTA\n• Integração com WhatsApp/formulário\n• Configuração básica de SEO e pixel de acompanhamento\n• Publicação no domínio do cliente',
    exclusions: 'Domínio, hospedagem, ferramentas pagas de e-mail marketing e produção de fotos/vídeos não estão incluídos.',
    timeline: 'Semana 1: estrutura e copy • Semana 2: design • Semana 3: desenvolvimento e ajustes • Semana 4: publicação.',
    payment_terms: PAY, closing: CLOSING,
    items: [{ name: 'Landing page', description: 'Estrutura, design responsivo, desenvolvimento e publicação', billing: 'pontual' }],
  },
  {
    key: 'trafego', label: 'Gestão de tráfego pago', title: 'Gestão de tráfego pago',
    intro: 'Esta proposta apresenta como vamos estruturar, otimizar e acompanhar suas campanhas para gerar demanda de forma previsível.',
    diagnosis: 'Anúncios sem estratégia queimam verba: público amplo demais, criativos que não prendem atenção e nenhuma leitura de métricas para decidir o próximo passo.',
    scope: '• Estratégia de campanhas e públicos\n• Criativos para anúncios (feed e stories)\n• Configuração de pixel/conversões\n• Otimização semanal\n• Relatório mensal com CPL, CTR e retorno',
    exclusions: 'A verba de mídia é paga diretamente às plataformas e não está incluída nos honorários. Não há garantia de volume de leads ou vendas.',
    timeline: 'Setup em até 7 dias úteis • Campanhas no ar após aprovação dos criativos • Otimizações semanais.',
    payment_terms: 'Honorários mensais antecipados, todo dia 5. Verba de mídia paga direto à plataforma.', closing: CLOSING,
    items: [{ name: 'Setup de campanhas', description: 'Estrutura, públicos, pixel e primeiros criativos', billing: 'pontual' }, { name: 'Gestão mensal de tráfego', description: 'Otimização, criativos e relatório', billing: 'mensal' }],
  },
  {
    key: 'consultoria', label: 'Consultoria / mentoria', title: 'Consultoria de design',
    intro: 'Uma consultoria direta, com foco no que destrava o seu resultado agora.',
    diagnosis: 'Você já tem energia e ideias, mas falta direção prática para priorizar o que fazer primeiro e executar com consistência.',
    scope: '• Diagnóstico inicial\n• Encontros por videochamada\n• Plano de ação personalizado\n• Material de apoio e revisão de entregas\n• Suporte entre encontros por mensagem',
    exclusions: 'Execução das peças e entregáveis finais não está incluída, salvo contratação à parte.',
    timeline: 'Encontros semanais ou quinzenais, conforme combinado.', payment_terms: PAY, closing: CLOSING,
    items: [{ name: 'Consultoria', description: 'Pacote de encontros e plano de ação', billing: 'pontual' }],
  },
  {
    key: 'em_branco', label: 'Em branco', title: 'Proposta comercial',
    intro: '', diagnosis: '', scope: '', exclusions: '', timeline: '', payment_terms: PAY, closing: CLOSING, items: [],
  },
];
