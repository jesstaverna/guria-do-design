# Guia de homologação (passo a passo)

Objetivo: colocar o Guria OS no ar num ambiente de teste real e validar o que os testes automáticos não cobrem (Auth real, e-mail, cron).

## 1. Supabase (≈10 min)
1. Crie um projeto em supabase.com (nome: `guria-os-homolog`). Guarde a senha do banco.
2. **SQL Editor**: cole e execute, **em ordem**, os 5 arquivos de `supabase/migrations/` (`...0001` até `...0005`). Cada um deve terminar sem erro.
3. **Authentication → Providers → Email**: deixe *Confirm email* **ligado**.
4. **Authentication → URL Configuration**: *Site URL* = a URL do app (passo 2); adicione `URL/login` em *Redirect URLs*.
5. **Project Settings → API**: copie `Project URL`, `anon key` e `service_role key` (esta é secreta).

## 2. Hospedagem do app (≈10 min, Vercel)
1. Importe o repositório `jesstaverna/guria-do-design` na Vercel (branch da entrega).
2. Variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (somente servidor)
   - `CRON_SECRET` (gere com `openssl rand -hex 32`)
   - `NEXT_PUBLIC_APP_URL` (a URL final, sem barra no fim)
3. Deploy. Volte ao Supabase e confirme a *Site URL* com a URL real.
4. `vercel.json` já agenda `/api/worker` de hora em hora (no plano gratuito/Hobby o mínimo é 1x por dia).

## 3. Virar administradora da plataforma
Crie sua conta pelo app (`/cadastro`), confirme o e-mail e rode no SQL Editor:
```sql
insert into platform_admins (user_id) select id from auth.users where email = 'SEU@EMAIL';
```
Depois acesse `/plataforma`.

## 4. Checklist de teste (marque cada item)
**Conta e acesso**
- [ ] Cadastro envia e-mail de confirmação e o link funciona
- [ ] Login, logout e “esqueci a senha” (se usar, configure o template de e-mail no Supabase)
- [ ] Onboarding cria o estúdio; em Configurações, preencher dados, CPF/CNPJ, cidade, logo (https) e imposto

**Fluxo comercial**
- [ ] Criar lead → registrar contato → tentar duplicar o e-mail (deve bloquear)
- [ ] Arrastar o lead entre etapas; mover para “Não fechado” exige motivo
- [ ] Criar proposta de um modelo, definir valores, liberar e **abrir o link em aba anônima / celular**
- [ ] Aceitar a proposta pelo link; conferir lead “Fechado”, cliente criado e alerta
- [ ] Ativar financeiro (parcelas + mensalidade + projeto)
- [ ] Gerar contrato, preencher os `[________]`, liberar, assinar pelo link, ver evidências
- [ ] “Baixar em PDF” da proposta e do contrato (imprimir → salvar como PDF) e conferir o visual

**Operação**
- [ ] Tarefa com prazo vencido aparece como atrasada; mudar status no cartão
- [ ] Post no calendário de conteúdo; mover pelo quadro até “Publicado”
- [ ] Campanha de tráfego: importar um CSV real exportado do Meta/Google; conferir CPL/CTR
- [ ] Meta de faturamento do mês + calculadora “quanto preciso faturar”
- [ ] Lançamento financeiro: receber/pagar, recorrência mensal

**Equipe e plano**
- [ ] Convidar uma 2ª pessoa (outro e-mail); ela entra e **não vê** Financeiro/Metas/Equipe
- [ ] No plano Solo, o convite de uma 2ª pessoa é bloqueado
- [ ] Em `/plataforma`, trocar status para *Cancelado*: o estúdio vira somente leitura; voltar para *Ativo*

**Automações** (depois de 1 hora)
- [ ] `GET https://SEU-APP/api/worker` com `Authorization: Bearer CRON_SECRET` retorna `ok: true`; sem o segredo, 401
- [ ] Alertas de atraso aparecem em `/alertas`

**Celular**
- [ ] Painel, CRM, proposta pública e contrato público legíveis em tela pequena

## 5. Anote o que travar
Para cada problema: tela, o que esperava, o que aconteceu (print ajuda). Traga a lista e eu corrijo em bloco.

## 6. Antes de vender
- [ ] Revisão jurídica dos 3 modelos de contrato
- [ ] Termos de uso e política de privacidade (LGPD) publicados
- [ ] Definir preços em `plans` (sugestão: Solo R$ 49 / Estúdio R$ 99)
- [ ] Backups ativos no Supabase (plano Pro) e teste de restauração
