// Variáveis e modelos de contrato. O texto final é gerado a partir de dados do estúdio (contratada), do cliente (contratante) e da proposta.
// ATENÇÃO: os modelos são ponto de partida genérico e NÃO substituem revisão jurídica. O sistema exibe esse aviso ao usuário.

export const CONTRACT_VARS: { key: string; label: string }[] = [
  { key: 'contratada_nome', label: 'Seu nome / razão social' }, { key: 'contratada_documento', label: 'Seu CPF/CNPJ' },
  { key: 'contratada_endereco', label: 'Seu endereço' }, { key: 'contratada_email', label: 'Seu e-mail' },
  { key: 'contratante_nome', label: 'Nome do cliente' }, { key: 'contratante_documento', label: 'CPF/CNPJ do cliente' },
  { key: 'contratante_endereco', label: 'Endereço do cliente' }, { key: 'contratante_email', label: 'E-mail do cliente' },
  { key: 'objeto', label: 'Serviços contratados' }, { key: 'valor_total', label: 'Valor total' }, { key: 'forma_pagamento', label: 'Forma de pagamento' },
  { key: 'prazo', label: 'Prazo de entrega' }, { key: 'data_inicio', label: 'Data de início' }, { key: 'data_fim', label: 'Data de término' },
  { key: 'cidade', label: 'Cidade / foro' }, { key: 'data_hoje', label: 'Data de hoje' },
];

/** Substitui {{variavel}}; o que não tiver valor vira [________] para o designer completar antes de enviar. */
export function renderTemplate(body: string, vars: Record<string, string | null | undefined>) {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k: string) => (vars[k]?.toString().trim() ? vars[k]!.toString() : '[________]'));
}
export const missingVars = (text: string) => (text.match(/\[________\]/g) ?? []).length;

const COMMON_TAIL = `
CLÁUSULA — DA PROPRIEDADE INTELECTUAL
Concluído o pagamento integral, a CONTRATADA cede ao CONTRATANTE os direitos patrimoniais de uso das versões finais aprovadas dos materiais criados, para as finalidades do projeto. Arquivos de trabalho, rascunhos, alternativas não escolhidas, fontes e licenças de terceiros permanecem com a CONTRATADA ou seus titulares, salvo ajuste escrito. A CONTRATADA poderá exibir o trabalho em portfólio e redes sociais, salvo pedido de sigilo por escrito.

CLÁUSULA — DA CONFIDENCIALIDADE E DOS DADOS PESSOAIS
As partes manterão sigilo sobre informações não públicas trocadas e tratarão dados pessoais conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), apenas para a execução deste contrato.

CLÁUSULA — DA RESCISÃO
Qualquer parte pode rescindir mediante aviso escrito com 15 dias de antecedência. Serviços já executados e etapas em andamento serão pagos proporcionalmente; valores de entrada não são reembolsáveis quando o trabalho já tiver sido iniciado.

CLÁUSULA — DO FORO
Fica eleito o foro da comarca de {{cidade}} para dirimir dúvidas deste contrato.

{{cidade}}, {{data_hoje}}.

CONTRATADA: {{contratada_nome}}
CONTRATANTE: {{contratante_nome}}
`;

const HEAD = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATADA: {{contratada_nome}}, inscrita sob o CPF/CNPJ {{contratada_documento}}, com endereço em {{contratada_endereco}}, e-mail {{contratada_email}}.
CONTRATANTE: {{contratante_nome}}, inscrito(a) sob o CPF/CNPJ {{contratante_documento}}, com endereço em {{contratante_endereco}}, e-mail {{contratante_email}}.
`;

export const BUILTIN_TEMPLATES: { id: string; name: string; body: string }[] = [
  {
    id: 'builtin:design',
    name: 'Prestação de serviços de design (identidade visual / peças)',
    body: `${HEAD}
CLÁUSULA — DO OBJETO
O presente contrato tem por objeto a prestação dos seguintes serviços de design: {{objeto}}.

CLÁUSULA — DO PRAZO
Os serviços serão iniciados em {{data_inicio}} e entregues em {{prazo}}. Os prazos dependem do envio, pelo CONTRATANTE, de briefing, textos, materiais e aprovações nos prazos combinados; atrasos do CONTRATANTE prorrogam os prazos na mesma proporção.

CLÁUSULA — DAS REVISÕES E APROVAÇÕES
Estão incluídas duas (2) rodadas de ajustes por etapa, sobre o conceito aprovado. Alterações de direção após a aprovação do conceito, ou rodadas adicionais, serão orçadas à parte.

CLÁUSULA — DO VALOR E DO PAGAMENTO
Pelos serviços, o CONTRATANTE pagará o valor total de {{valor_total}}, nas seguintes condições: {{forma_pagamento}}. O atraso sujeita o débito a multa de 2% e juros de 1% ao mês, e pode suspender a execução e a entrega dos arquivos finais.
${COMMON_TAIL}`,
  },
  {
    id: 'builtin:social',
    name: 'Gestão de redes sociais / conteúdo (mensal)',
    body: `${HEAD}
CLÁUSULA — DO OBJETO
O presente contrato tem por objeto a prestação mensal dos seguintes serviços de criação e gestão de conteúdo para redes sociais: {{objeto}}.

CLÁUSULA — DA VIGÊNCIA
O contrato vigora de {{data_inicio}} a {{data_fim}}, renovando-se por igual período se não houver manifestação contrária com 30 dias de antecedência.

CLÁUSULA — DAS OBRIGAÇÕES DO CONTRATANTE
Fornecer acessos, informações, imagens e aprovações do planejamento de conteúdo nos prazos combinados. A ausência de aprovação no prazo pode resultar em publicação fora do calendário, sem reposição de entregas.

CLÁUSULA — DOS RESULTADOS
A CONTRATADA se compromete com a execução dos serviços descritos, não garantindo resultados específicos de alcance, engajamento ou vendas, que dependem de fatores externos como algoritmos das plataformas.

CLÁUSULA — DO VALOR E DO PAGAMENTO
O CONTRATANTE pagará o valor total de {{valor_total}}, nas seguintes condições: {{forma_pagamento}}. Verbas de mídia paga, quando houver, são pagas diretamente às plataformas e não integram este valor.
${COMMON_TAIL}`,
  },
  {
    id: 'builtin:trafego',
    name: 'Gestão de tráfego pago',
    body: `${HEAD}
CLÁUSULA — DO OBJETO
O presente contrato tem por objeto a gestão de campanhas de tráfego pago, compreendendo: {{objeto}}.

CLÁUSULA — DA VIGÊNCIA
O contrato vigora de {{data_inicio}} a {{data_fim}}, renovando-se automaticamente por igual período se não houver manifestação contrária com 30 dias de antecedência.

CLÁUSULA — DA VERBA DE MÍDIA
O investimento em anúncios é de responsabilidade do CONTRATANTE, pago diretamente à plataforma (Meta, Google ou outra), e não se confunde com os honorários da CONTRATADA. A CONTRATADA não responde por bloqueios, reprovações ou suspensões de conta decorrentes de políticas das plataformas.

CLÁUSULA — DOS RESULTADOS
A CONTRATADA atuará com as melhores práticas de mercado, sem garantir volume de leads, vendas ou retorno específico, que dependem de oferta, produto, preço, atendimento comercial e fatores de mercado.

CLÁUSULA — DOS HONORÁRIOS
Pela gestão, o CONTRATANTE pagará o valor de {{valor_total}}, nas seguintes condições: {{forma_pagamento}}. Relatórios de desempenho serão entregues periodicamente.
${COMMON_TAIL}`,
  },
];
