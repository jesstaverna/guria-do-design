# GURIA OS — Arquitetura e plano

## 1. Visão
Produto para **vender a outros designers**. Reaproveita a base do Muvens OS (Next.js 15 App Router, Server Actions, Supabase/Postgres com regras no banco), mas com **multi-tenancy**: cada cliente (designer/estúdio) é um *workspace*.

```
Navegador ─► Next.js (Server Components + Server Actions, sessão do usuário → RLS) ─► Supabase (Postgres + Auth)
 /p/[token] proposta pública ─┐ só RPCs security definer, sem acesso a tabelas (anon)
 /c/[token] contrato público ─┤
 /convite/[token] ────────────┘
 /api/worker ◄── agendador externo (Vercel Cron / pg_cron / n8n) ── app.run_scheduled_scans() p/ todos os workspaces
```

## 2. Multi-tenant e segurança
- `workspaces` (plano, status, trial) · `workspace_members` (owner / admin / member) · `workspace_invites` (link com token, 7 dias, preso ao e-mail).
- **Toda tabela de negócio tem `workspace_id`** e RLS por pertencimento (`app.apply_rls`). Relações usam **FK composta `(id, workspace_id)`**: é impossível ligar um registro a dados de outro tenant.
- `owner/admin` veem tudo; `member` não acessa financeiro, orçamento, metas, equipe, plano (RLS, não só menu).
- Plano/status/trial/owner só mudam via service role ou `platform_admins` (trigger `guard_workspace`).
- **Assinatura vencida = somente leitura** (`app.ws_open`): dados nunca ficam presos.
- Limites de plano (`plans.max_members`, `max_clients`) aplicados por trigger.
- Funções internas SECURITY DEFINER sem EXECUTE para usuários; `run_scheduled_scans` só para `service_role`.
- Auditoria (`audit_log`) em workspaces, membros, clientes, leads, propostas, contratos, lançamentos, metas, campanhas.
- Dinheiro em **centavos** (bigint); datas de negócio em America/Sao_Paulo.

## 3. Módulos (rotas)
| Rota | Módulo |
|---|---|
| `/dashboard` | Painel: financeiro (só admin), funil, propostas, prazos, conteúdo, tráfego, metas, alertas |
| `/crm` | Kanban/lista, anti-duplicidade (e-mail/telefone normalizados), motivo da perda, histórico, follow-up |
| `/clientes` | Cadastro único; visão 360° |
| `/propostas` | Modelos (identidade, social, landing, tráfego, consultoria), itens pontual/mensal, desconto, link público, aceite/pedido de alteração, PDF por impressão, ativação financeira (parcelas + mensalidades + projeto) |
| `/contratos` | Modelos próprios + 3 padrões, variáveis preenchidas por estúdio/cliente/proposta, aceite eletrônico simples com evidências (nome, documento, IP, data, hash SHA-256) |
| `/projetos`, `/tarefas`, `/agenda` | Projetos com progresso; tarefas em **Kanban ou Lista** (prioridade, prazo, responsável); **anexos** (arquivos até 25 MB em bucket privado + links, com Google Drive reconhecido e seletor oficial opcional — `docs/GOOGLE-DRIVE.md`); calendário unificado de prazos |
| `/conteudo` | Calendário por rede social, quadro por etapa (ideia→publicado), pilares |
| `/trafego` | Campanhas, métricas diárias (manual ou CSV), CPL/CTR/CPC/ROAS, meta de CPL com alerta, relatório PDF |
| `/financeiro` | Receber/pagar, atrasos, recorrências automáticas |
| `/planejamento` | Metas (receita, lucro, clientes, propostas, leads, posts) com projeção; **calculadora “quanto preciso faturar”**; orçamento por categoria; caixa histórico + previsão |
| `/equipe`, `/configuracoes`, `/plano`, `/plataforma` | Convites e papéis · dados do estúdio/marca/imposto, **upload de logotipo e avatar** · limites · gestão de todos os estúdios (quem vende) |

## 4. Automações (worker)
`GET/POST /api/worker` (Bearer `CRON_SECRET`) → `run_scheduled_scans()`: gera recorrências, expira propostas, alerta recebimento atrasado, tarefa atrasada (ao responsável), publicação de amanhã, proposta parada 5+ dias, lead sem contato 3+ dias, contrato sem assinatura, campanha sem métricas, **CPL acima da meta**, fim do teste. Idempotente (`dedupe_key`).

## 5. Decisões e limites honestos
- **Cobrança do SaaS não está integrada** (Asaas/Stripe). Hoje o plano/status é gerido em `/plataforma`. Próximo passo: webhook do gateway → `workspaces.status/billing_ref`.
- **Tráfego**: sem sincronização automática com Meta/Google Ads (exige app aprovado e tokens por cliente). Lançamento manual + CSV; nada é simulado.
- **Contratos**: modelos genéricos, **revisar com advogado**. O aceite é assinatura eletrônica *simples*; para ICP-Brasil/avançada integrar Clicksign/ZapSign.
- Aceite público registra IP enviado pelo servidor Next (cabeçalho `x-forwarded-for`); é evidência, não prova forte.
- Notificações são in-app (sem e-mail/WhatsApp). Convites são por link copiado.
- Preços/limites dos planos em `plans` são **exemplos** (Solo R$ 49 / Estúdio R$ 99): defina os seus.
- Fontes Tusker/Standert não embutidas (licença): ver `globals.css`.
- LGPD: definir política de privacidade, base legal e DPA (Supabase, hospedagem); exportação de dados do usuário ainda não implementada.

## 6. Roadmap sugerido
1. Cobrança recorrente + webhook · 2. E-mail transacional (convites, alertas, propostas) · 3. Portal do cliente (aprovação de conteúdo) · 4. Integrações Meta/Google Ads · 5. Assistente de IA (briefing, legendas, propostas) · 6. Exportação de dados / importação de CSV de clientes e leads · 7. Biblioteca de modelos para vender (marketplace).

## Módulo de Planejamento de Conteúdo (migration 0008)

Três áreas, **um único conjunto de registros** (`content_posts`): Pilares (`/conteudo/pilares`), Calendário (`/conteudo/calendario`: mês/semana/lista, semana começa na segunda) e Kanban (`/conteudo/kanban`: Ideia → Roteiro → Em produção → Em revisão → Aprovado → Agendado na plataforma → Publicado). Mover um cartão ou reagendar no calendário altera o mesmo registro; os indicadores dos pilares/painel são calculados do banco. O acervo reserva (`/conteudo/acervo`) fica separado (`bucket` = acervo/remanejado/ideia, sem data).

- Tabelas novas: `content_campaigns`, `content_post_campaigns`, `content_post_events` (histórico por trigger), `content_attachments`, `content_import_runs`. `content_posts`/`content_pillars` foram **estendidas**, não duplicadas.
- Regras no banco: 7 cards (ou 0), ManyChat sempre `enabled=false`, “Publicado” exige data real e confirmação, `manually_edited_at` marca edição manual.
- Importação (`/conteudo/importar`, só admin): ensaio (dry-run, nada gravado) → relatório → aplicar. Idempotente por `external_id`/hash; registros editados à mão ou divergentes viram **conflito reportado**, nunca sobrescritos. Nada é publicado nem automatizado.
- Para instalar: rode `supabase/migrations/20261012000008_content_planning.sql` (e 0006/0007 se ainda não rodou) no SQL Editor; depois importe o JSON pela tela.

## Prospecção (migration 0011) — Comercial

`/prospeccao`: encontra empresas por nicho + cidade (Google Maps / Places API), analisa a presença digital com **dados públicos** (HTTPS, celular, WhatsApp, formulário, pixel, redes, contatos publicados), calcula a **pontuação de oportunidade** (regras simples e editáveis em `src/lib/prospecting/analysis.ts`), sugere o serviço de design e permite **converter o prospecto em lead do CRM**. Também há cadastro manual.

- Tabelas: `prospect_campaigns`, `prospects`, `prospect_searches` (todas com `workspace_id` + RLS; unicidade de local/e-mail/domínio **por estúdio**).
- Busca no Google Maps usa a **chave da plataforma** (`GOOGLE_PLACES_API_KEY`, só no servidor). Cota mensal por plano em `plans.max_prospect_searches` (Essencial 5, Pro 20, Premium 60), contada em `prospect_searches`.
- Dados do Google de prospectos não trabalhados são limpos após 30 dias (worker diário, `app.purge_prospect_snapshots`).
- Análise de sites com proteção contra SSRF (`src/integrations/net-safe.ts`): só http(s), bloqueia IP privado, limita tempo/tamanho/redirecionamentos.
- **Não envia mensagens** (nem e-mail nem WhatsApp). Você aborda por conta própria; o sistema só organiza e registra. Envio automático com aprovação existe no Muvens OS e fica para uma etapa futura.
- A chamada à API real do Google **não foi testada** (sem credencial no desenvolvimento): valide em homologação e confira cotas, custos e os termos da Plataforma Google Maps e a LGPD (legítimo interesse).

## Onboarding do cliente (migration 0013)

Ao **ativar uma proposta aceita** (um clique do administrador, como já era), o estúdio pode escolher um **modelo de onboarding**: o sistema cria o projeto, as **tarefas encadeadas** (datas somando a duração de cada etapa), os recebíveis/mensalidades e o **Espaço do Cliente**. O modelo é sugerido pelas palavras-chave (título e itens da proposta). Projetos já existentes podem iniciar o onboarding pela própria página do projeto.

- **Modelos** (`onboarding_templates` / `onboarding_steps`, por estúdio, editáveis em *Projetos → Modelos de onboarding*): 4 padrões (Identidade visual, Social media, Site/Landing page, Tráfego pago). Etapa = título, instrução ao cliente, dias, quem faz (estúdio/cliente) e se aparece para o cliente.
- **Cronograma que se ajusta**: ao mudar o prazo de uma etapa (editar a tarefa), `shift_chain` desloca as etapas seguintes ainda abertas e o prazo final do projeto, e avisa nos alertas.
- **Espaço do Cliente** (`/cliente/<token>`, sem login): marca do estúdio, andamento, etapas, “o que precisamos de você” (o cliente responde com texto/link; a etapa vai para revisão e o estúdio é avisado). Acesso só por token (64 hex, `portal_open`/`portal_respond` com SECURITY DEFINER e campos mínimos); o estúdio pode desligar o link ou gerar outro.
- **Rotinas automáticas** (worker diário `run_scheduled_scans`): lembrete de pendência do cliente (vencida ou sem resposta há 3+ dias) e **Resumo do dia** (uma vez por dia) nos alertas. Não envia e-mail: isso depende de provedor de e-mail e fica para depois.
- Nada é enviado para fora automaticamente.
