# Deploy e operação

## 1. Ambientes
3 projetos Supabase (dev / homologação / produção) + um deploy do app por ambiente. O schema vem **somente** de `supabase/migrations/` (ordem numérica).

## 2. Primeiro acesso
1. Aplicar as migrações (`supabase db push` ou SQL Editor — use só um caminho).
2. Supabase → Auth: **signup aberto fica LIGADO** (é um SaaS); recomendo **confirmação de e-mail ligada**, “Site URL” e redirects para o domínio, e política de senha forte.
3. Variáveis no host: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**só servidor**), `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`.
4. Torne-se administrador da plataforma (acessa `/plataforma`), após criar sua conta:
   `insert into platform_admins (user_id) select id from auth.users where email = 'voce@dominio.com';`

## 3. Automações 24/7
`/api/worker` com `Authorization: Bearer $CRON_SECRET`. Escolha **um** agendador: Vercel Cron (`vercel.json`, de hora em hora — alertas diários são idempotentes), `pg_cron + pg_net`, ou n8n. Verifique pelo painel de alertas e por `/api/health`.

## 4. Vendendo
- Defina preços/limites em `plans` (`update plans set price_cents = ..., max_clients = ...`).
- Novo cliente: cadastro → 14 dias de teste (`trial_ends_at`). Fim do teste ⇒ somente leitura.
- Ativar manualmente: `/plataforma` → status **Ativo** (e plano). Para cobrança automática, conectar Asaas/Stripe (roadmap).

## 5. Testes
```bash
npm test && npm run typecheck && npm run build
npm run test:db                       # SQL (requer PostgreSQL 15+ local)
# consultas via PostgREST local (após test:db): subir PostgREST apontando para o banco guria_test
#   db-uri="postgres://authenticator:pw@127.0.0.1:5432/guria_test"  jwt-secret="test-secret-test-secret-test-secret-123456"  server-port=3111
node supabase/tests/api_smoke.mjs
```
Checklist de segurança a cada nova tabela: `workspace_id`, `select app.apply_rls('tabela'[, true])`, FK composta, teste em `rules.test.sql`.
