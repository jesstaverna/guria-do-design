-- GURIA OS — 0005 Financeiro, metas/orçamento, métricas do painel, varreduras automáticas, criação de workspace e permissões

-- ---------- financeiro (somente owner/admin) ----------
create table public.fin_categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  direction     text not null check (direction in ('in','out')),
  unique (id, workspace_id),
  unique (workspace_id, direction, name)
);
select app.apply_rls('fin_categories', true);

create table public.fin_recurring (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  direction     text not null check (direction in ('in','out')),
  description   text not null check (length(btrim(description)) >= 2),
  amount_cents  bigint not null check (amount_cents > 0),
  day_of_month  int not null default 5 check (day_of_month between 1 and 28),
  start_date    date not null,
  end_date      date,
  active        boolean not null default true,
  category_id   uuid, client_id uuid, proposal_id uuid,
  created_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (category_id, workspace_id) references public.fin_categories (id, workspace_id) on delete set null (category_id),
  foreign key (client_id, workspace_id)   references public.clients (id, workspace_id)        on delete set null (client_id),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id)      on delete set null (proposal_id)
);
select app.apply_rls('fin_recurring', true); select app.audit_table('fin_recurring');

create table public.fin_transactions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  direction     text not null check (direction in ('in','out')),
  description   text not null check (length(btrim(description)) >= 2),
  amount_cents  bigint not null check (amount_cents > 0),
  due_date      date not null,
  paid_date     date,
  status        text not null default 'previsto' check (status in ('previsto','pago','cancelado')),
  category_id   uuid, client_id uuid, project_id uuid, proposal_id uuid, recurring_id uuid,
  competence    date,
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status <> 'pago' or paid_date is not null),
  foreign key (category_id, workspace_id) references public.fin_categories (id, workspace_id) on delete set null (category_id),
  foreign key (client_id, workspace_id)   references public.clients (id, workspace_id)        on delete set null (client_id),
  foreign key (project_id, workspace_id)  references public.projects (id, workspace_id)       on delete set null (project_id),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id)      on delete set null (proposal_id),
  foreign key (recurring_id, workspace_id) references public.fin_recurring (id, workspace_id) on delete set null (recurring_id)
);
create unique index fin_tx_recurring_uq on public.fin_transactions (recurring_id, competence) where recurring_id is not null;
create index fin_tx_ws_idx on public.fin_transactions (workspace_id, due_date);
create trigger trg_fin_tx_touch before update on public.fin_transactions for each row execute function app.touch_updated_at();
select app.apply_rls('fin_transactions', true); select app.audit_table('fin_transactions');

create table public.budgets (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  category_id   uuid not null,
  month         date not null check (extract(day from month) = 1),
  planned_cents bigint not null check (planned_cents >= 0),
  unique (category_id, month),
  foreign key (category_id, workspace_id) references public.fin_categories (id, workspace_id) on delete cascade
);
select app.apply_rls('budgets', true);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  kind          text not null check (kind in ('receita','lucro','novos_clientes','propostas_fechadas','novos_leads','posts_publicados')),
  period_start  date not null,
  period_end    date not null,
  target        numeric not null check (target > 0),     -- centavos para receita/lucro; quantidade nos demais
  note          text,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start),
  unique (workspace_id, kind, period_start, period_end)
);
select app.apply_rls('goals', true); select app.audit_table('goals');

-- Gera lançamentos das recorrências até a data limite (idempotente: unique(recurring_id, competence)).
create or replace function app.generate_recurring(p_ws uuid, p_upto date) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with src as (
    select r.*, gs::date as comp
      from public.fin_recurring r
      cross join lateral generate_series(date_trunc('month', r.start_date), date_trunc('month', least(coalesce(r.end_date, p_upto), p_upto)), interval '1 month') gs
     where r.workspace_id = p_ws and r.active
  ), ins as (
    insert into public.fin_transactions (workspace_id, direction, description, amount_cents, due_date, category_id, client_id, proposal_id, recurring_id, competence)
    select workspace_id, direction, description, amount_cents, comp + (day_of_month - 1), category_id, client_id, proposal_id, id, comp
      from src where comp + (day_of_month - 1) >= start_date and (end_date is null or comp + (day_of_month - 1) <= end_date)
    on conflict (recurring_id, competence) where recurring_id is not null do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

create or replace function public.generate_recurring_now(p_ws uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_ws_admin(p_ws) and app.ws_open(p_ws)) then raise exception 'sem permissão' using errcode = '42501'; end if;
  return app.generate_recurring(p_ws, (date_trunc('month', app.today()) + interval '2 months' - interval '1 day')::date);
end $$;

-- Ativa uma proposta aceita: parcelas do valor pontual, mensalidades recorrentes e (opcional) projeto.
-- O desconto abate o valor pontual (e o excedente, se houver, não é distribuído nas mensalidades).
create or replace function public.activate_proposal(p_id uuid, p_installments int, p_first_due date, p_create_project boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare p public.proposals; net bigint; each_c bigint; i int; pid uuid; rid uuid; cat_in uuid;
begin
  select * into p from public.proposals where id = p_id for update;
  if not found or not (app.is_ws_admin(p.workspace_id) and app.ws_open(p.workspace_id)) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p.status <> 'aceita' then raise exception 'Somente propostas aceitas podem ser ativadas' using errcode = '23514'; end if;
  if p.activated_at is not null then raise exception 'Proposta já ativada' using errcode = '23514'; end if;
  if p_installments not between 1 and 36 then raise exception 'Parcelas entre 1 e 36' using errcode = '22023'; end if;
  select id into cat_in from public.fin_categories where workspace_id = p.workspace_id and direction = 'in' order by name limit 1;

  if p_create_project then
    insert into public.projects (workspace_id, name, client_id, start_date, created_by) values (p.workspace_id, p.title, p.client_id, p_first_due, auth.uid()) returning id into pid;
  end if;

  net := greatest(p.one_time_cents - p.discount_cents, 0);
  if net > 0 then
    each_c := net / p_installments;
    for i in 1..p_installments loop
      insert into public.fin_transactions (workspace_id, direction, description, amount_cents, due_date, category_id, client_id, project_id, proposal_id, created_by)
      values (p.workspace_id, 'in', format('Proposta #%s — %s (%s/%s)', p.number, p.title, i, p_installments),
              case when i = p_installments then net - each_c * (p_installments - 1) else each_c end,
              (p_first_due + make_interval(months => i - 1))::date, cat_in, p.client_id, pid, p.id, auth.uid());
    end loop;
  end if;
  if p.monthly_cents > 0 then
    insert into public.fin_recurring (workspace_id, direction, description, amount_cents, day_of_month, start_date, end_date, category_id, client_id, proposal_id)
    values (p.workspace_id, 'in', format('Proposta #%s — %s (mensal)', p.number, p.title), p.monthly_cents, least(extract(day from p_first_due)::int, 28),
            p_first_due, (p_first_due + make_interval(months => p.contract_months))::date - 1, cat_in, p.client_id, p.id) returning id into rid;
    perform app.generate_recurring(p.workspace_id, (p_first_due + make_interval(months => p.contract_months))::date);
  end if;
  update public.proposals set activated_at = now(), project_id = pid where id = p.id;
  insert into public.proposal_events (workspace_id, proposal_id, kind, detail) values (p.workspace_id, p.id, 'ativada', p_installments || ' parcela(s)');
end $$;

-- ---------- métricas do painel ----------
create or replace function public.dashboard_metrics(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; adm boolean := app.is_ws_admin(p_ws); today date := app.today(); tax numeric;
begin
  if not app.is_member(p_ws) then raise exception 'sem acesso' using errcode = '42501'; end if;
  r := jsonb_build_object(
    'clients_active', (select count(*) from public.clients where workspace_id = p_ws and status = 'ativo'),
    'leads_new', (select count(*) from public.leads where workspace_id = p_ws and app.br_date(created_at) between p_from and p_to),
    'leads_won', (select count(*) from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.workspace_id = p_ws and s.kind = 'won' and app.br_date(l.closed_at) between p_from and p_to),
    'leads_lost', (select count(*) from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.workspace_id = p_ws and s.kind = 'lost' and app.br_date(l.closed_at) between p_from and p_to),
    'pipeline_open_cents', (select coalesce(sum(l.potential_value_cents), 0) from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.workspace_id = p_ws and s.kind = 'open'),
    'pipeline_weighted_cents', (select coalesce(sum(l.potential_value_cents * s.probability / 100), 0)::bigint from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.workspace_id = p_ws and s.kind = 'open'),
    'proposals_sent', (select count(*) from public.proposals where workspace_id = p_ws and app.br_date(sent_at) between p_from and p_to),
    'proposals_accepted', (select count(*) from public.proposals where workspace_id = p_ws and app.br_date(accepted_at) between p_from and p_to),
    'proposals_accepted_cents', (select coalesce(sum(total_cents), 0) from public.proposals where workspace_id = p_ws and app.br_date(accepted_at) between p_from and p_to),
    'proposals_open', (select count(*) from public.proposals where workspace_id = p_ws and status in ('enviada','visualizada','em_negociacao')),
    'contracts_awaiting', (select count(*) from public.contracts where workspace_id = p_ws and status = 'enviado'),
    'tasks_open', (select count(*) from public.tasks where workspace_id = p_ws and status <> 'feito'),
    'tasks_overdue', (select count(*) from public.tasks where workspace_id = p_ws and status <> 'feito' and due_date < today),
    'tasks_week', (select count(*) from public.tasks where workspace_id = p_ws and status <> 'feito' and due_date between today and today + 7),
    'tasks_done', (select count(*) from public.tasks where workspace_id = p_ws and status = 'feito' and app.br_date(completed_at) between p_from and p_to),
    'posts_week', (select count(*) from public.content_posts where workspace_id = p_ws and status <> 'publicado' and publish_date between today and today + 7),
    'posts_published', (select count(*) from public.content_posts where workspace_id = p_ws and status = 'publicado' and publish_date between p_from and p_to),
    'ads_spend_cents', (select coalesce(sum(spend_cents), 0) from public.ad_metrics_daily where workspace_id = p_ws and day between p_from and p_to),
    'ads_leads', (select coalesce(sum(leads), 0) from public.ad_metrics_daily where workspace_id = p_ws and day between p_from and p_to),
    'ads_revenue_cents', (select coalesce(sum(revenue_cents), 0) from public.ad_metrics_daily where workspace_id = p_ws and day between p_from and p_to),
    'ads_campaigns_active', (select count(*) from public.ad_campaigns where workspace_id = p_ws and status = 'ativa'));
  if adm then
    select tax_rate_pct into tax from public.workspaces where id = p_ws;
    r := r || jsonb_build_object(
      'received_cents', (select coalesce(sum(amount_cents), 0) from public.fin_transactions where workspace_id = p_ws and direction = 'in' and status = 'pago' and paid_date between p_from and p_to),
      'spent_cents', (select coalesce(sum(amount_cents), 0) from public.fin_transactions where workspace_id = p_ws and direction = 'out' and status = 'pago' and paid_date between p_from and p_to),
      'receivable_cents', (select coalesce(sum(amount_cents), 0) from public.fin_transactions where workspace_id = p_ws and direction = 'in' and status = 'previsto' and due_date between p_from and p_to),
      'payable_cents', (select coalesce(sum(amount_cents), 0) from public.fin_transactions where workspace_id = p_ws and direction = 'out' and status = 'previsto' and due_date between p_from and p_to),
      'overdue_cents', (select coalesce(sum(amount_cents), 0) from public.fin_transactions where workspace_id = p_ws and direction = 'in' and status = 'previsto' and due_date < today),
      'overdue_count', (select count(*) from public.fin_transactions where workspace_id = p_ws and direction = 'in' and status = 'previsto' and due_date < today),
      'mrr_cents', (select coalesce(sum(amount_cents), 0) from public.fin_recurring where workspace_id = p_ws and direction = 'in' and active and start_date <= today and (end_date is null or end_date >= today)),
      'tax_rate_pct', tax);
  end if;
  return r;
end $$;

create or replace function public.goal_progress(p_ws uuid) returns table (goal_id uuid, kind text, period_start date, period_end date, target numeric, actual numeric, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not app.is_ws_admin(p_ws) then raise exception 'sem acesso' using errcode = '42501'; end if;
  return query
  select g.id, g.kind, g.period_start, g.period_end, g.target,
    case g.kind
      when 'receita' then (select coalesce(sum(t.amount_cents), 0) from public.fin_transactions t where t.workspace_id = p_ws and t.direction = 'in' and t.status = 'pago' and t.paid_date between g.period_start and g.period_end)::numeric
      when 'lucro' then (select coalesce(sum(case when t.direction = 'in' then t.amount_cents else -t.amount_cents end), 0) from public.fin_transactions t where t.workspace_id = p_ws and t.status = 'pago' and t.paid_date between g.period_start and g.period_end)::numeric
      when 'novos_clientes' then (select count(*) from public.clients c where c.workspace_id = p_ws and app.br_date(c.created_at) between g.period_start and g.period_end)::numeric
      when 'propostas_fechadas' then (select count(*) from public.proposals p where p.workspace_id = p_ws and app.br_date(p.accepted_at) between g.period_start and g.period_end)::numeric
      when 'novos_leads' then (select count(*) from public.leads l where l.workspace_id = p_ws and app.br_date(l.created_at) between g.period_start and g.period_end)::numeric
      when 'posts_publicados' then (select count(*) from public.content_posts c where c.workspace_id = p_ws and c.status = 'publicado' and c.publish_date between g.period_start and g.period_end)::numeric
    end, g.note
  from public.goals g where g.workspace_id = p_ws order by g.period_start desc, g.kind;
end $$;

-- ---------- varreduras automáticas (chamadas pelo worker agendado, service role) ----------
create or replace function app.run_scheduled_scans() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w record; today date := app.today(); wk text := to_char(app.today(), 'IYYY-IW'); gen int := 0; exp int := 0; r record;
begin
  for w in select * from public.workspaces where status = 'active' or (status = 'trial' and trial_ends_at > now() - interval '3 days') loop
    -- recorrências
    gen := gen + app.generate_recurring(w.id, (date_trunc('month', today) + interval '3 months' - interval '1 day')::date);
    -- propostas vencidas
    update public.proposals set status = 'expirada' where workspace_id = w.id and status in ('enviada','visualizada','em_negociacao') and valid_until < today;
    get diagnostics exp = row_count;
    -- recebimentos em atraso
    for r in select id, description, amount_cents from public.fin_transactions where workspace_id = w.id and direction = 'in' and status = 'previsto' and due_date < today loop
      perform app.notify(w.id, 'Pagamento em atraso', r.description, '/financeiro', 'critical', 'admin', null, 'late:' || r.id);
    end loop;
    -- tarefas atrasadas
    for r in select id, title, assignee_id from public.tasks where workspace_id = w.id and status <> 'feito' and due_date < today loop
      perform app.notify(w.id, 'Tarefa atrasada', r.title, '/tarefas', 'warning', null, r.assignee_id, 'task_late:' || r.id);
    end loop;
    -- publicações de amanhã ainda não publicadas
    for r in select id, title, network from public.content_posts where workspace_id = w.id and status <> 'publicado' and publish_date = today + 1 loop
      perform app.notify(w.id, 'Publicação amanhã', r.network || ' · ' || r.title, '/conteudo', 'info', null, null, 'post_soon:' || r.id);
    end loop;
    -- propostas paradas (5+ dias) e leads sem contato (3+ dias): alerta semanal
    for r in select id, title from public.proposals where workspace_id = w.id and status in ('enviada','visualizada') and sent_at < now() - interval '5 days' loop
      perform app.notify(w.id, 'Proposta sem resposta há 5+ dias', r.title, '/propostas/' || r.id, 'warning', null, null, 'prop_stale:' || r.id || ':' || wk);
    end loop;
    for r in select l.id, l.name from public.leads l join public.pipeline_stages s on s.id = l.stage_id where l.workspace_id = w.id and s.kind = 'open' and l.last_contact_at < now() - interval '3 days' loop
      perform app.notify(w.id, 'Lead sem contato há 3+ dias', r.name, '/crm/' || r.id, 'warning', null, null, 'lead_stale:' || r.id || ':' || wk);
    end loop;
    -- contratos enviados e não assinados
    for r in select id, title from public.contracts where workspace_id = w.id and status = 'enviado' and sent_at < now() - interval '5 days' loop
      perform app.notify(w.id, 'Contrato aguardando assinatura', r.title, '/contratos/' || r.id, 'warning', null, null, 'contract_stale:' || r.id || ':' || wk);
    end loop;
    -- tráfego: campanha ativa sem métricas há 3 dias; CPL acima da meta nos últimos 3 dias
    for r in select c.id, c.name from public.ad_campaigns c where c.workspace_id = w.id and c.status = 'ativa'
             and not exists (select 1 from public.ad_metrics_daily m where m.campaign_id = c.id and m.day >= today - 3) loop
      perform app.notify(w.id, 'Campanha sem métricas recentes', r.name || ' — atualize os números.', '/trafego/' || r.id, 'info', null, null, 'ads_nodata:' || r.id || ':' || wk);
    end loop;
    for r in select c.id, c.name, c.target_cpl_cents, sum(m.spend_cents) sp, sum(m.leads) ld from public.ad_campaigns c
             join public.ad_metrics_daily m on m.campaign_id = c.id and m.day >= today - 3
             where c.workspace_id = w.id and c.status = 'ativa' and c.target_cpl_cents is not null group by c.id loop
      if r.ld > 0 and r.sp / r.ld > r.target_cpl_cents then
        perform app.notify(w.id, 'CPL acima da meta', r.name, '/trafego/' || r.id, 'critical', null, null, 'ads_cpl:' || r.id || ':' || today);
      elsif r.ld = 0 and r.sp > r.target_cpl_cents then
        perform app.notify(w.id, 'Campanha gastando sem gerar leads', r.name, '/trafego/' || r.id, 'critical', null, null, 'ads_nolead:' || r.id || ':' || today);
      end if;
    end loop;
    -- fim do teste
    if w.status = 'trial' and w.trial_ends_at between now() and now() + interval '3 days' then
      perform app.notify(w.id, 'Seu teste termina em breve', 'Escolha um plano para continuar editando.', '/plano', 'warning', 'admin', null, 'trial_end:' || w.id);
    end if;
  end loop;
  return jsonb_build_object('recurring_generated', gen, 'ran_at', now());
end $$;

create or replace function public.run_scheduled_scans() returns jsonb language sql security definer set search_path = public as $$
  select app.run_scheduled_scans()
$$;

-- ---------- criação de workspace (onboarding) ----------
create or replace function app.seed_workspace(p_ws uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.pipeline_stages (workspace_id, name, position, kind, probability) values
    (p_ws, 'Novo contato', 1, 'open', 10), (p_ws, 'Conversa / briefing', 2, 'open', 30),
    (p_ws, 'Proposta enviada', 3, 'open', 50), (p_ws, 'Negociação', 4, 'open', 70),
    (p_ws, 'Fechado', 5, 'won', 100), (p_ws, 'Não fechado', 6, 'lost', 0);
  insert into public.fin_categories (workspace_id, name, direction) values
    (p_ws, 'Identidade visual', 'in'), (p_ws, 'Social media', 'in'), (p_ws, 'Design gráfico / peças', 'in'),
    (p_ws, 'Sites e landing pages', 'in'), (p_ws, 'Tráfego pago (gestão)', 'in'), (p_ws, 'Consultoria / mentoria', 'in'), (p_ws, 'Outras receitas', 'in'),
    (p_ws, 'Software e ferramentas', 'out'), (p_ws, 'Impostos', 'out'), (p_ws, 'Equipe / freelancers', 'out'),
    (p_ws, 'Marketing próprio', 'out'), (p_ws, 'Pró-labore', 'out'), (p_ws, 'Educação', 'out'), (p_ws, 'Equipamentos', 'out'), (p_ws, 'Outras despesas', 'out');
end $$;

create or replace function public.create_workspace(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); wid uuid; base text;
begin
  if uid is null then raise exception 'login necessário' using errcode = '28000'; end if;
  if (select count(*) from public.workspaces where owner_id = uid) >= 3 then
    raise exception 'Limite de espaços por conta atingido' using errcode = '53400';
  end if;
  base := trim(both '-' from lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  insert into public.workspaces (name, slug, owner_id, email)
  values (btrim(p_name), coalesce(nullif(base, ''), 'estudio') || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6), uid,
          (select email from public.profiles where id = uid))
  returning id into wid;
  insert into public.workspace_members (workspace_id, user_id, role) values (wid, uid, 'owner');
  perform app.seed_workspace(wid);
  return wid;
end $$;

-- ---------- permissões ----------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.convert_lead(uuid), public.generate_recurring_now(uuid), public.activate_proposal(uuid, int, date, boolean),
  public.dashboard_metrics(uuid, date, date), public.goal_progress(uuid), public.create_workspace(text), public.accept_invite(text)
  to authenticated;
grant execute on function
  public.proposal_public_open(text, text, text), public.proposal_public_accept(text, text, text, text, text),
  public.proposal_public_request_changes(text, text, text, text, text),
  public.contract_public_open(text), public.contract_public_sign(text, text, text, text, text), public.invite_public_info(text)
  to anon, authenticated;
grant execute on function public.run_scheduled_scans() to service_role;

-- funções internas (SECURITY DEFINER) não são chamáveis por usuários finais
revoke execute on function app.notify(uuid, text, text, text, text, text, uuid, text), app.generate_recurring(uuid, date),
  app.run_scheduled_scans(), app.seed_workspace(uuid) from public, anon, authenticated;
grant execute on function app.run_scheduled_scans() to service_role;
