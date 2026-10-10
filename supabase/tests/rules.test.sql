-- Testes de regras de negócio, isolamento multi-tenant (RLS) e fluxos. Roda em PostgreSQL local (ver run_local.sh).
-- Qualquer falha lança exceção e interrompe o script (ON_ERROR_STOP).

create schema t;
grant usage on schema t to anon, authenticated;
create table t.ctx (k text primary key, v text);
grant all on t.ctx to anon, authenticated;
create function t.ok(c boolean, m text) returns void language plpgsql as $$
begin if not coalesce(c, false) then raise exception 'FALHOU: %', m; end if; end $$;
create function t.get(k text) returns text language sql stable as $$ select v from t.ctx where t.ctx.k = $1 $$;
create function t.put(k text, v text) returns void language sql as $$ insert into t.ctx values ($1, $2) on conflict (k) do update set v = excluded.v $$;
-- executa SQL e exige que falhe com o SQLSTATE indicado
create function t.raises(q text, code text) returns void language plpgsql as $$
begin
  execute q;
exception when others then
  if sqlstate <> code then raise exception 'FALHOU: esperado % mas veio % (%) em: %', code, sqlstate, sqlerrm, q; end if;
  return;
end $$;
-- executa SQL e devolve nº de linhas afetadas/lidas
create function t.cnt(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || q || ') x' into n; return n; end $$;
grant execute on all functions in schema t to anon, authenticated;

create function t.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); end $$;
grant execute on function t.login(uuid) to authenticated, anon;

-- ===== usuários e workspaces =====
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.com', '{"full_name":"Ana"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bia@b.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'caio@c.com', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'dani@d.com', '{}');
select t.ok((select count(*) from public.profiles) = 4, 'perfil criado por trigger');

select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.put('wsA', public.create_workspace('Estúdio da Ana')::text);
reset role;
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.put('wsB', public.create_workspace('Bia Design')::text);
select t.ok((select count(*) from public.workspaces) = 1, 'B enxerga só o próprio workspace');
select t.ok((select count(*) from public.pipeline_stages) = 6, 'etapas do funil semeadas');
select t.ok((select count(*) from public.fin_categories) = 15, 'categorias semeadas');
select t.raises($$select public.create_workspace('x')$$, '23514');   -- nome curto (CHECK)
insert into public.clients (workspace_id, name) values (t.get('wsB')::uuid, 'Cliente da Bia');
select t.put('cliB', (select id::text from public.clients limit 1));
reset role;

-- ===== isolamento entre tenants =====
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok((select count(*) from public.workspaces) = 1, 'A enxerga só o próprio workspace');
select t.ok((select count(*) from public.clients) = 0, 'A não enxerga clientes de B');
select t.raises(format($$insert into public.clients (workspace_id, name) values (%L, 'Invasor')$$, t.get('wsB')), '42501');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 0, 'A não enxerga perfil de B');
select t.raises(format($$update public.workspaces set plan = 'solo' where id = %L$$, t.get('wsA')), '42501');   -- guard de plano
update public.workspaces set name = 'Estúdio da Ana Ltda' where id = t.get('wsA')::uuid;   -- campos livres podem
select t.raises($$select * from public.dashboard_metrics('00000000-0000-0000-0000-000000000099', current_date, current_date)$$, '42501');
select t.raises(format($$select * from public.dashboard_metrics(%L, current_date, current_date)$$, t.get('wsB')), '42501');

-- FK composta: não dá para ligar registro do tenant A a cliente do tenant B
select t.raises(format($$insert into public.tasks (workspace_id, title, client_id) values (%L, 'Tarefa', %L)$$, t.get('wsA'), t.get('cliB')), '23503');

-- ===== CRM =====
select t.put('stNew', (select id::text from public.pipeline_stages where position = 1));
select t.put('stLost', (select id::text from public.pipeline_stages where kind = 'lost'));
insert into public.leads (workspace_id, name, phone, email, stage_id, potential_value_cents)
  values (t.get('wsA')::uuid, 'Lead Um', '+55 (11) 98888-7777', 'Um@Teste.com', t.get('stNew')::uuid, 500000);
select t.raises(format($$insert into public.leads (workspace_id, name, phone, stage_id) values (%L, 'Dup', '11988887777', %L)$$, t.get('wsA'), t.get('stNew')), '23505');
select t.raises(format($$insert into public.leads (workspace_id, name, email, stage_id) values (%L, 'Dup', ' um@teste.COM ', %L)$$, t.get('wsA'), t.get('stNew')), '23505');
select t.raises(format($$insert into public.leads (workspace_id, name, stage_id) values (%L, 'Sem contato', %L)$$, t.get('wsA'), t.get('stNew')), '23514');
select t.raises(format($$update public.leads set stage_id = %L$$, t.get('stLost')), '23514');   -- perda exige motivo
update public.leads set stage_id = t.get('stLost')::uuid, lost_reason = 'Sem orçamento';
select t.ok((select closed_at is not null from public.leads), 'lead perdido tem closed_at');
update public.leads set stage_id = t.get('stNew')::uuid;
select t.ok((select lost_reason is null and closed_at is null from public.leads), 'reabrir lead limpa motivo e closed_at');
select t.put('leadA', (select id::text from public.leads));
insert into public.lead_interactions (workspace_id, lead_id, kind, content) values (t.get('wsA')::uuid, t.get('leadA')::uuid, 'nota', 'Conversei por WhatsApp');
reset role;
-- mesmo telefone em outro workspace é permitido
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;
insert into public.leads (workspace_id, name, phone, stage_id)
  values (t.get('wsB')::uuid, 'Lead da Bia', '11988887777', (select id from public.pipeline_stages where position = 1));
reset role;

-- ===== proposta: totais, envio, link público, aceite =====
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.proposals (workspace_id, title, lead_id, contract_months, discount_cents, valid_until, intro)
  values (t.get('wsA')::uuid, 'Identidade + Social', t.get('leadA')::uuid, 3, 10000, current_date + 10, 'Olá');
select t.put('prop', (select id::text from public.proposals));
insert into public.proposal_items (workspace_id, proposal_id, name, billing, quantity, unit_price_cents) values
  (t.get('wsA')::uuid, t.get('prop')::uuid, 'Identidade visual', 'pontual', 1, 100000),
  (t.get('wsA')::uuid, t.get('prop')::uuid, 'Social media', 'mensal', 1, 50000);
select t.ok((select number = 1 and one_time_cents = 100000 and monthly_cents = 50000 and total_cents = 240000 from public.proposals), 'totais: 1000 + 500x3 - 100 = 2400');
select t.put('token', (select token from public.proposals));
select t.ok((select length(token) = 64 from public.proposals), 'token de 64 hex');
reset role;

set role anon;
select t.ok(public.proposal_public_open(t.get('token')) is null, 'rascunho não abre no link público');
select t.raises($$select * from public.proposals$$, '42501');           -- anon sem acesso a tabelas
select t.raises($$select * from public.clients$$, '42501');
reset role;

select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
update public.proposals set status = 'enviada';
select t.ok((select sent_at is not null from public.proposals), 'enviar marca sent_at');
reset role;
set role anon;
select t.ok((public.proposal_public_open(t.get('token'))->>'status') = 'visualizada', 'abrir marca visualizada');
select t.ok((public.proposal_public_open(t.get('token'))->'items') is not null and jsonb_array_length(public.proposal_public_open(t.get('token'))->'items') = 2, 'link traz itens');
select t.ok(public.proposal_public_open(t.get('token'))::text not like '%token%', 'link não vaza token');
select t.raises(format($$select public.proposal_public_accept(%L, 'Cli', 'invalido')$$, t.get('token')), '22023');
select t.ok(public.proposal_public_accept(t.get('token'), 'Maria Cliente', 'maria@cliente.com', '1.2.3.4', 'ua'), 'aceite');
select t.ok(not public.proposal_public_accept(t.get('token'), 'Maria Cliente', 'maria@cliente.com'), 'segundo aceite é ignorado');
reset role;
select t.ok((select status = 'aceita' and accepted_ip = '1.2.3.4' and client_id is not null from public.proposals), 'aceita com evidência e cliente');
select t.ok((select s.kind = 'won' from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.id = t.get('leadA')::uuid), 'lead movido para ganho');
select t.ok((select count(*) from public.proposal_events) = 3, 'eventos: enviada, visualizada, aceita');
select t.ok((select count(*) from public.notifications where workspace_id = t.get('wsA')::uuid) = 2, 'alertas de visualização e aceite');

select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.raises(format($$update public.proposal_items set unit_price_cents = 1 where proposal_id = %L$$, t.get('prop')), '23514');
select t.raises(format($$update public.proposals set discount_cents = 0 where id = %L$$, t.get('prop')), '23514');

-- ===== ativação financeira =====
select public.activate_proposal(t.get('prop')::uuid, 3, current_date, true);
select t.ok((select count(*) = 3 and sum(amount_cents) = 90000 from public.fin_transactions where recurring_id is null), 'parcelas: (1000-100)=900 em 3x');
select t.ok((select count(*) = 3 and sum(amount_cents) = 150000 from public.fin_transactions where recurring_id is not null), 'mensalidades geradas: 3 x 500');
select t.ok((select count(*) = 1 from public.projects), 'projeto criado');
select t.raises(format($$select public.activate_proposal(%L, 3, current_date, true)$$, t.get('prop')), '23514');   -- já ativada
select t.ok(public.generate_recurring_now(t.get('wsA')::uuid) = 0, 'recorrência idempotente');

-- ===== contratos =====
insert into public.contracts (workspace_id, title, body, client_id, proposal_id)
  values (t.get('wsA')::uuid, 'Contrato Maria', 'Cláusula 1', (select client_id from public.proposals), t.get('prop')::uuid);
select t.put('ctoken', (select token from public.contracts));
select t.ok((select number = 1 from public.contracts), 'contrato numerado');
reset role;
set role anon;
select t.ok(public.contract_public_open(t.get('ctoken')) is null, 'rascunho não abre');
reset role;
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
update public.contracts set status = 'enviado';
select t.raises($$update public.contracts set body = 'Alterado'$$, '23514');
reset role;
set role anon;
select t.raises(format($$select public.contract_public_sign(%L, 'Maria', '123')$$, t.get('ctoken')), '22023');
select t.ok(public.contract_public_sign(t.get('ctoken'), 'Maria Cliente', '529.982.247-25', '9.9.9.9', 'ua'), 'assinatura');
select t.ok(not public.contract_public_sign(t.get('ctoken'), 'Maria Cliente', '52998224725'), 'não assina duas vezes');
reset role;
select t.ok((select status = 'assinado' and length(body_hash) = 64 and signed_document = '52998224725' from public.contracts), 'evidências de assinatura');

-- ===== equipe: papéis, convite, limites =====
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.workspace_invites (workspace_id, email, role) values (t.get('wsA')::uuid, 'caio@c.com', 'member');
select t.put('inv', (select token from public.workspace_invites));
reset role;
set role anon; select t.ok(public.invite_public_info(t.get('inv'))->>'workspace' like 'Estúdio%', 'info do convite'); reset role;

select t.login('00000000-0000-0000-0000-00000000000d'); set role authenticated;
select t.raises(format($$select public.accept_invite(%L)$$, t.get('inv')), '42501');   -- e-mail diferente
reset role;
select t.login('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select t.ok(public.accept_invite(t.get('inv')) = t.get('wsA')::uuid, 'convite aceito');
select t.ok((select count(*) from public.clients) = 1, 'membro enxerga clientes do estúdio');
select t.ok((select count(*) from public.fin_transactions) = 0, 'membro não enxerga financeiro');
select t.raises(format($$insert into public.fin_transactions (workspace_id, direction, description, amount_cents, due_date) values (%L, 'in', 'x1', 100, current_date)$$, t.get('wsA')), '42501');
select t.ok((select count(*) from public.goals) = 0, 'membro não enxerga metas');
select t.ok(not (public.dashboard_metrics(t.get('wsA')::uuid, current_date - 30, current_date) ? 'received_cents'), 'painel do membro sem financeiro');
select t.ok((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 1, 'membro enxerga perfil do dono');
insert into public.tasks (workspace_id, title, due_date, assignee_id) values (t.get('wsA')::uuid, 'Revisar logo', current_date - 2, '00000000-0000-0000-0000-00000000000c');
select t.raises(format($$update public.workspace_members set role = 'owner' where workspace_id = %L$$, t.get('wsA')), '42501');
reset role;

-- limite do plano Solo: 1 membro
update public.workspaces set plan = 'solo' where id = t.get('wsA')::uuid;
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.workspace_invites (workspace_id, email) values (t.get('wsA')::uuid, 'dani@d.com');
select t.put('inv2', (select token from public.workspace_invites where email = 'dani@d.com'));
reset role;
select t.login('00000000-0000-0000-0000-00000000000d'); set role authenticated;
select t.raises(format($$select public.accept_invite(%L)$$, t.get('inv2')), '53400');
reset role;
update public.workspaces set plan = 'studio' where id = t.get('wsA')::uuid;

-- ===== assinatura expirada: somente leitura =====
update public.workspaces set trial_ends_at = now() - interval '1 day' where id = t.get('wsB')::uuid;
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok((select count(*) from public.clients) = 1, 'trial expirado ainda lê dados');
select t.raises(format($$insert into public.clients (workspace_id, name) values (%L, 'Novo')$$, t.get('wsB')), '42501');
reset role;
update public.workspaces set trial_ends_at = now() + interval '5 days' where id = t.get('wsB')::uuid;

-- ===== metas, painel, automações =====
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.fin_transactions (workspace_id, direction, description, amount_cents, due_date, status, paid_date)
  values (t.get('wsA')::uuid, 'in', 'Recebido avulso', 200000, current_date, 'pago', current_date),
         (t.get('wsA')::uuid, 'out', 'Software', 30000, current_date, 'pago', current_date);
insert into public.fin_transactions (workspace_id, direction, description, amount_cents, due_date)
  values (t.get('wsA')::uuid, 'in', 'Parcela atrasada', 70000, current_date - 5);
select t.raises(format($$insert into public.fin_transactions (workspace_id, direction, description, amount_cents, due_date, status) values (%L, 'in', 'sem data', 1000, current_date, 'pago')$$, t.get('wsA')), '23514');
insert into public.goals (workspace_id, kind, period_start, period_end, target)
  values (t.get('wsA')::uuid, 'receita', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 1000000);
select t.ok((select actual = 200000 from public.goal_progress(t.get('wsA')::uuid) where kind = 'receita'), 'meta de receita = recebido no período');
select t.ok((public.dashboard_metrics(t.get('wsA')::uuid, date_trunc('month', current_date)::date, current_date)->>'received_cents')::bigint = 200000, 'painel: recebido');
select t.ok((public.dashboard_metrics(t.get('wsA')::uuid, date_trunc('month', current_date)::date, current_date)->>'overdue_cents')::bigint = 70000, 'painel: atrasado');
select t.ok((public.dashboard_metrics(t.get('wsA')::uuid, date_trunc('month', current_date)::date, current_date)->>'tasks_overdue')::int = 1, 'painel: tarefa atrasada');

insert into public.ad_campaigns (workspace_id, platform, name, objective, target_cpl_cents)
  values (t.get('wsA')::uuid, 'meta', 'Captação Ana', 'leads', 1500);
insert into public.ad_metrics_daily (workspace_id, campaign_id, day, spend_cents, impressions, clicks, leads)
  values (t.get('wsA')::uuid, (select id from public.ad_campaigns), current_date, 10000, 5000, 200, 4);   -- CPL 25,00 > 15,00
select t.raises(format($$insert into public.ad_metrics_daily (workspace_id, campaign_id, day) values (%L, (select id from public.ad_campaigns), current_date)$$, t.get('wsA')), '23505');
reset role;

select app.run_scheduled_scans();
select t.ok((select count(*) from public.notifications where title = 'Pagamento em atraso') = 1, 'alerta de atraso');
select t.ok((select count(*) from public.notifications where title = 'Tarefa atrasada' and user_id = '00000000-0000-0000-0000-00000000000c') = 1, 'alerta de tarefa ao responsável');
select t.ok((select count(*) from public.notifications where title = 'CPL acima da meta') = 1, 'alerta de CPL');
select app.run_scheduled_scans();
select t.ok((select count(*) from public.notifications where title in ('Pagamento em atraso', 'Tarefa atrasada', 'CPL acima da meta')) = 3, 'varredura idempotente (sem duplicar alertas)');

-- visibilidade dos alertas: tarefa só para o responsável; atraso financeiro só admin
select t.login('00000000-0000-0000-0000-00000000000c'); set role authenticated;
select t.ok((select count(*) from public.notifications where title = 'Pagamento em atraso') = 0, 'membro não vê alerta financeiro');
select t.ok((select count(*) from public.notifications where title = 'Tarefa atrasada') = 1, 'membro vê a própria tarefa atrasada');
reset role;
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.ok((select count(*) from public.notifications where title = 'Pagamento em atraso') = 1, 'admin vê alerta financeiro');
select t.ok((select count(*) from public.audit_log) > 5, 'auditoria visível ao admin');
select t.raises($$select public.run_scheduled_scans()$$, '42501');   -- usuário final não roda varredura
reset role;
select t.ok(has_function_privilege('service_role', 'public.run_scheduled_scans()', 'execute'), 'service_role roda a varredura');

-- orçamento
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.budgets (workspace_id, category_id, month, planned_cents)
  values (t.get('wsA')::uuid, (select id from public.fin_categories where name = 'Software e ferramentas'), date_trunc('month', current_date)::date, 50000);
select t.raises(format($$insert into public.budgets (workspace_id, category_id, month, planned_cents) values (%L, (select id from public.fin_categories where name = 'Impostos'), '2026-10-15', 1)$$, t.get('wsA')), '23514');
reset role;
