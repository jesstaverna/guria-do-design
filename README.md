# GURIA OS

Sistema de gestão para **designers e estúdios** (multiusuário / SaaS): CRM, propostas com link e aceite, gerador de contratos, projetos e tarefas, agenda de prazos, planejamento de conteúdo por rede social, tráfego pago, financeiro, metas e orçamento. Next.js 15 + Supabase (PostgreSQL com RLS). Cada designer tem o seu **espaço (workspace)**, isolado por RLS.

Homologação passo a passo: [`docs/HOMOLOGACAO.md`](docs/HOMOLOGACAO.md) · Arquitetura, modelo de dados, decisões e roadmap: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) · Publicação e operação: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Rodando
```bash
cp .env.example .env.local     # preencha com um projeto Supabase (aplique supabase/migrations/*.sql)
npm install
npm run dev
```
Renomear/rebrandear: `src/lib/brand.ts` (nome) e `tailwind.config.ts` / `globals.css` (cores e fontes).

## Testes executados nesta entrega
| Camada | Comando | Cobertura |
|---|---|---|
| Regras puras | `npm test` | dinheiro, totais, parcelas, metas/projeção, KPIs de tráfego, CSV, contratos |
| Banco | `npm run test:db` | migrações, RLS e **isolamento entre tenants**, papéis, limites de plano, trial expirado (somente leitura), proposta→aceite→financeiro, contrato e assinatura, alertas idempotentes |
| Consultas das páginas | `node supabase/tests/api_smoke.mjs` | embeds, RPCs, upserts e permissões via PostgREST real |
| Navegador (E2E) | roteiro Playwright (ver docs/DEPLOY.md §5) | cadastro → estúdio → lead → proposta → aceite público → financeiro → contrato → assinatura → tarefa/conteúdo/tráfego/metas |
| Build | `npm run typecheck && npm run build` | TypeScript e produção |

**Não testado:** Auth real (GoTrue: e-mail de confirmação, recuperação de senha), Supabase hospedado e Vercel Cron. O E2E usou um proxy de autenticação simulado + PostgREST real. Valide em homologação (docs/DEPLOY.md).
