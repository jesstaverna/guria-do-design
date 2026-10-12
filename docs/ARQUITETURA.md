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
