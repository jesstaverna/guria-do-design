-- OrbiaHUB — 0013 Onboarding do cliente: modelos de etapas por serviço, projeto com tarefas encadeadas (cronograma que se ajusta),
-- Espaço do Cliente (página pública por link) e rotinas automáticas (lembretes + resumo do dia nos alertas).
-- Nada é enviado sozinho para fora: o cliente só vê a página do link; o estúdio ativa a proposta com um clique.

-- ---------- modelos de onboarding ----------
create table public.onboarding_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  description   text,
  keywords      text,                       -- palavras para sugerir o modelo a partir dos itens da proposta (separadas por vírgula)
  position      int not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
select app.apply_rls('onboarding_templates'); select app.audit_table('onboarding_templates');

create table public.onboarding_steps (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  template_id   uuid not null,
  position      int not null default 0,
  title         text not null check (length(btrim(title)) >= 2),
  description   text,
  duration_days int not null default 3 check (duration_days between 0 and 180),
  owner_side    text not null default 'estudio' check (owner_side in ('estudio', 'cliente')),
  client_visible boolean not null default true,
  foreign key (template_id, workspace_id) references public.onboarding_templates (id, workspace_id) on delete cascade
);
create index onboarding_steps_idx on public.onboarding_steps (template_id, position);
select app.apply_rls('onboarding_steps');

-- ---------- projeto: Espaço do Cliente ----------
alter table public.projects add column if not exists template_id uuid;
alter table public.projects add column if not exists portal_token text not null default app.new_token();
alter table public.projects add column if not exists portal_enabled boolean not null default true;
alter table public.projects add column if not exists welcome_message text;
create unique index if not exists projects_portal_token_uq on public.projects (portal_token);

-- ---------- tarefas encadeadas ----------
alter table public.tasks add column if not exists chain_pos int;                                   -- posição na cadeia do onboarding (nulo = tarefa avulsa)
alter table public.tasks add column if not exists owner_side text not null default 'estudio' check (owner_side in ('estudio', 'cliente'));
alter table public.tasks add column if not exists client_visible boolean not null default false;   -- aparece no Espaço do Cliente
alter table public.tasks add column if not exists client_response text;
alter table public.tasks add column if not exists client_done_at timestamptz;
create index if not exists tasks_chain_idx on public.tasks (project_id, chain_pos) where chain_pos is not null;

-- ---------- modelos padrão (4 serviços de design) ----------
create or replace function app.seed_onboarding(p_ws uuid) returns void language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if exists (select 1 from public.onboarding_templates where workspace_id = p_ws) then return; end if;

  insert into public.onboarding_templates (workspace_id, name, description, keywords, position) values (p_ws, 'Identidade visual', 'Do briefing à entrega do manual e dos arquivos.', 'identidade,logo,marca,branding', 1) returning id into t;
  insert into public.onboarding_steps (workspace_id, template_id, position, title, description, duration_days, owner_side, client_visible) values
    (p_ws, t, 1, 'Briefing preenchido pelo cliente', 'Envie o briefing, referências e informações da marca.', 3, 'cliente', true),
    (p_ws, t, 2, 'Reunião de alinhamento', 'Conversa para alinhar expectativas e prazos.', 2, 'estudio', true),
    (p_ws, t, 3, 'Pesquisa e DNA da marca', 'Estratégia, conceito e direção criativa.', 5, 'estudio', true),
    (p_ws, t, 4, 'Paleta, tipografia e logo (1ª apresentação)', null, 7, 'estudio', true),
    (p_ws, t, 5, 'Feedback do cliente', 'Comentários e pedidos de ajuste.', 3, 'cliente', true),
    (p_ws, t, 6, 'Ajustes e aplicações da marca', null, 7, 'estudio', true),
    (p_ws, t, 7, 'Exportação dos arquivos e manual da marca', 'PNG, SVG, PDF e orientações de uso.', 4, 'estudio', true),
    (p_ws, t, 8, 'Entrega final e aprovação', null, 2, 'cliente', true);

  insert into public.onboarding_templates (workspace_id, name, description, keywords, position) values (p_ws, 'Social media', 'Do diagnóstico ao primeiro mês de conteúdo.', 'social,instagram,conteúdo,conteudo,posts,redes', 2) returning id into t;
  insert into public.onboarding_steps (workspace_id, template_id, position, title, description, duration_days, owner_side, client_visible) values
    (p_ws, t, 1, 'Acessos e informações da marca', 'Envie acessos, logos e materiais disponíveis.', 3, 'cliente', true),
    (p_ws, t, 2, 'Diagnóstico e linha editorial', 'Pilares de conteúdo e tom de voz.', 5, 'estudio', true),
    (p_ws, t, 3, 'Calendário do primeiro mês', null, 4, 'estudio', true),
    (p_ws, t, 4, 'Aprovação do calendário', 'Revise os temas e as datas.', 3, 'cliente', true),
    (p_ws, t, 5, 'Produção dos primeiros posts', null, 7, 'estudio', true),
    (p_ws, t, 6, 'Aprovação dos posts', null, 3, 'cliente', true),
    (p_ws, t, 7, 'Início das publicações', null, 1, 'estudio', true);

  insert into public.onboarding_templates (workspace_id, name, description, keywords, position) values (p_ws, 'Site / Landing page', 'Do briefing ao site no ar.', 'site,landing,página,pagina,web', 3) returning id into t;
  insert into public.onboarding_steps (workspace_id, template_id, position, title, description, duration_days, owner_side, client_visible) values
    (p_ws, t, 1, 'Briefing e conteúdo do cliente', 'Textos, imagens, domínio e referências.', 5, 'cliente', true),
    (p_ws, t, 2, 'Estrutura e wireframe', null, 4, 'estudio', true),
    (p_ws, t, 3, 'Design das telas', null, 8, 'estudio', true),
    (p_ws, t, 4, 'Aprovação do design', null, 3, 'cliente', true),
    (p_ws, t, 5, 'Desenvolvimento / montagem', null, 10, 'estudio', true),
    (p_ws, t, 6, 'Revisão e ajustes', null, 4, 'cliente', true),
    (p_ws, t, 7, 'Publicação e entrega', null, 2, 'estudio', true);

  insert into public.onboarding_templates (workspace_id, name, description, keywords, position) values (p_ws, 'Tráfego pago', 'Da conta de anúncios à primeira campanha no ar.', 'tráfego,trafego,anúncio,anuncio,ads,meta,google', 4) returning id into t;
  insert into public.onboarding_steps (workspace_id, template_id, position, title, description, duration_days, owner_side, client_visible) values
    (p_ws, t, 1, 'Acessos às contas de anúncios e pixel', null, 3, 'cliente', true),
    (p_ws, t, 2, 'Planejamento, público e orçamento', null, 4, 'estudio', true),
    (p_ws, t, 3, 'Criativos das campanhas', null, 6, 'estudio', true),
    (p_ws, t, 4, 'Aprovação dos criativos e verba', null, 2, 'cliente', true),
    (p_ws, t, 5, 'Campanha no ar', null, 2, 'estudio', true),
    (p_ws, t, 6, 'Primeira análise de resultados', null, 7, 'estudio', true);
end $$;
revoke all on function app.seed_onboarding(uuid) from public, anon, authenticated;

create or replace function app.seed_onboarding_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin perform app.seed_onboarding(new.id); return new; end $$;
create trigger trg_workspaces_seed_onboarding after insert on public.workspaces for each row execute function app.seed_onboarding_trg();
select app.seed_onboarding(id) from public.workspaces;      -- estúdios que já existem

-- ---------- onboarding: cria as tarefas encadeadas do projeto ----------
create or replace function app.build_onboarding(p_project uuid, p_template uuid, p_start date, p_actor uuid) returns int
language plpgsql security definer set search_path = public as $$
declare pr public.projects; s record; due date := p_start; n int := 0;
begin
  select * into pr from public.projects where id = p_project;
  if not found then raise exception 'Projeto não encontrado' using errcode = '23503'; end if;
  if not exists (select 1 from public.onboarding_templates where id = p_template and workspace_id = pr.workspace_id) then raise exception 'Modelo inválido' using errcode = '23503'; end if;
  if exists (select 1 from public.tasks where project_id = p_project and chain_pos is not null) then raise exception 'Este projeto já tem um onboarding' using errcode = '23514'; end if;
  for s in select * from public.onboarding_steps where template_id = p_template order by position, title loop
    due := due + s.duration_days;
    insert into public.tasks (workspace_id, title, description, status, priority, due_date, project_id, client_id, chain_pos, owner_side, client_visible, created_by)
    values (pr.workspace_id, s.title, s.description, 'a_fazer', 'media', due, p_project, pr.client_id, s.position, s.owner_side, s.client_visible, p_actor);
    n := n + 1;
  end loop;
  update public.projects set template_id = p_template, start_date = coalesce(p_start, start_date), due_date = due where id = p_project;
  return n;
end $$;
revoke all on function app.build_onboarding(uuid, uuid, date, uuid) from public, anon, authenticated;

create or replace function public.start_onboarding(p_project uuid, p_template uuid, p_start date) returns int
language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  select workspace_id into ws from public.projects where id = p_project;
  if ws is null or not app.can_write(ws) then raise exception 'sem permissão' using errcode = '42501'; end if;
  return app.build_onboarding(p_project, p_template, coalesce(p_start, app.today()), auth.uid());
end $$;

-- ---------- ativar proposta: agora também pode iniciar o onboarding ----------
drop function if exists public.activate_proposal(uuid, int, date, boolean);
create or replace function public.activate_proposal(p_id uuid, p_installments int, p_first_due date, p_create_project boolean default true, p_template uuid default null) returns void
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
    if p_template is not null then perform app.build_onboarding(pid, p_template, p_first_due, auth.uid()); end if;
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
  insert into public.proposal_events (workspace_id, proposal_id, kind, detail) values (p.workspace_id, p.id, 'ativada', p_installments || ' parcela(s)' || case when p_template is not null then ' + onboarding' else '' end);
end $$;

-- ---------- cronograma que se ajusta: muda o prazo de uma etapa e as seguintes acompanham ----------
create or replace function public.shift_chain(p_task uuid, p_new_due date) returns int
language plpgsql security definer set search_path = public as $$
declare t public.tasks; delta int; n int := 0;
begin
  select * into t from public.tasks where id = p_task for update;
  if not found or not app.can_write(t.workspace_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if p_new_due is null then raise exception 'Informe a nova data' using errcode = '22023'; end if;
  delta := p_new_due - coalesce(t.due_date, p_new_due);
  update public.tasks set due_date = p_new_due where id = t.id;
  if t.chain_pos is not null and t.project_id is not null and delta <> 0 then
    update public.tasks set due_date = due_date + delta
     where project_id = t.project_id and workspace_id = t.workspace_id and chain_pos > t.chain_pos and status <> 'feito' and due_date is not null;
    get diagnostics n = row_count;
    update public.projects set due_date = (select max(due_date) from public.tasks where project_id = t.project_id and chain_pos is not null) where id = t.project_id;
    if n > 0 then
      perform app.notify(t.workspace_id, 'Cronograma recalculado', format('“%s” mudou %s dia(s); %s etapa(s) seguinte(s) foram ajustadas.', t.title, abs(delta), n), '/projetos/' || t.project_id, 'info', null, null, 'shift:' || t.id || ':' || p_new_due);
    end if;
  end if;
  return n;
end $$;

-- ---------- Espaço do Cliente (público, só por token) ----------
create or replace function public.portal_open(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare pr public.projects; w public.workspaces; steps jsonb; done int; total int;
begin
  if p_token is null or length(p_token) < 20 then return null; end if;
  select * into pr from public.projects where portal_token = p_token and portal_enabled;
  if not found then return null; end if;
  select * into w from public.workspaces where id = pr.workspace_id;
  select count(*) filter (where status = 'feito'), count(*) into done, total from public.tasks where project_id = pr.id and client_visible;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'description', description, 'due_date', due_date, 'status', status,
           'owner_side', owner_side, 'client_response', client_response, 'client_done_at', client_done_at) order by chain_pos nulls last, due_date nulls last, created_at), '[]'::jsonb)
    into steps from public.tasks where project_id = pr.id and client_visible;
  return jsonb_build_object('project', jsonb_build_object('name', pr.name, 'status', pr.status, 'start_date', pr.start_date, 'due_date', pr.due_date, 'welcome', pr.welcome_message),
    'studio', jsonb_build_object('name', w.name, 'logo_url', w.logo_url, 'color', w.brand_color, 'email', w.email, 'phone', w.phone),
    'progress', jsonb_build_object('done', done, 'total', total), 'steps', steps);
end $$;

create or replace function public.portal_respond(p_token text, p_task uuid, p_response text) returns boolean
language plpgsql security definer set search_path = public as $$
declare pr public.projects; t public.tasks; txt text := left(btrim(coalesce(p_response, '')), 2000);
begin
  if p_token is null or length(p_token) < 20 then return false; end if;
  select * into pr from public.projects where portal_token = p_token and portal_enabled;
  if not found then return false; end if;
  select * into t from public.tasks where id = p_task and project_id = pr.id and client_visible and owner_side = 'cliente' for update;
  if not found or t.status = 'feito' then return false; end if;
  if length(txt) < 2 then raise exception 'Escreva sua resposta ou cole um link' using errcode = '22023'; end if;
  update public.tasks set client_response = txt, client_done_at = now(), status = 'revisao' where id = t.id;
  perform app.notify(t.workspace_id, 'Cliente respondeu', format('%s · %s', pr.name, t.title), '/tarefas/' || t.id, 'info', null, t.assignee_id, 'client_resp:' || t.id || ':' || extract(epoch from now())::bigint);
  return true;
end $$;

-- ---------- rotinas automáticas (worker diário): lembrete de pendências do cliente + resumo do dia ----------
create or replace function app.run_onboarding_routines() returns jsonb
language plpgsql security definer set search_path = public as $$
declare w record; r record; today date := app.today(); wk text := to_char(app.today(), 'IYYY-IW'); late int; due_today int; digests int := 0; reminders int := 0;
  pay_today int; posts_today int; open_tasks int;
begin
  for w in select * from public.workspaces where status = 'active' or (status = 'trial' and trial_ends_at > now() - interval '3 days') loop
    -- pendências do cliente paradas (vencidas ou sem resposta há 3+ dias)
    for r in select t.id, t.title, p.name as project from public.tasks t join public.projects p on p.id = t.project_id
              where t.workspace_id = w.id and t.owner_side = 'cliente' and t.client_visible and t.status = 'a_fazer' and t.chain_pos is not null
                and (t.due_date < today or t.created_at < now() - interval '3 days') and p.status = 'em_andamento' loop
      perform app.notify(w.id, 'Cliente ainda não respondeu', r.project || ' · ' || r.title, '/tarefas/' || r.id, 'warning', null, null, 'client_pending:' || r.id || ':' || wk);
      reminders := reminders + 1;
    end loop;
    -- resumo do dia (uma vez por dia, só se houver algo)
    select count(*) into late from public.tasks where workspace_id = w.id and status <> 'feito' and due_date < today;
    select count(*) into due_today from public.tasks where workspace_id = w.id and status <> 'feito' and due_date = today;
    select count(*) into open_tasks from public.tasks where workspace_id = w.id and status = 'revisao';
    select count(*) into pay_today from public.fin_transactions where workspace_id = w.id and direction = 'in' and status = 'previsto' and due_date = today;
    select count(*) into posts_today from public.content_posts where workspace_id = w.id and status <> 'publicado' and publish_date = today;
    if late + due_today + open_tasks + pay_today + posts_today > 0 then
      perform app.notify(w.id, 'Resumo do dia',
        format('%s tarefa(s) para hoje · %s atrasada(s) · %s em revisão · %s recebimento(s) previsto(s) · %s publicação(ões) hoje', due_today, late, open_tasks, pay_today, posts_today),
        '/dashboard', 'info', null, null, 'digest:' || today);
      digests := digests + 1;
    end if;
  end loop;
  return jsonb_build_object('client_reminders', reminders, 'daily_digests', digests);
end $$;
revoke all on function app.run_onboarding_routines() from public, anon, authenticated;

create or replace function public.run_scheduled_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; purged int; ob jsonb;
begin
  r := app.run_scheduled_scans();
  purged := app.purge_prospect_snapshots();
  ob := app.run_onboarding_routines();
  return coalesce(r, '{}'::jsonb) || jsonb_build_object('purged_google_snapshots', purged) || ob;
end $$;

-- ---------- permissões ----------
grant select, insert, update, delete on public.onboarding_templates, public.onboarding_steps to authenticated;
grant all on public.onboarding_templates, public.onboarding_steps to service_role;
revoke execute on function public.start_onboarding(uuid, uuid, date), public.shift_chain(uuid, date), public.activate_proposal(uuid, int, date, boolean, uuid), public.portal_open(text), public.portal_respond(text, uuid, text) from public, anon, authenticated;
grant execute on function public.start_onboarding(uuid, uuid, date), public.shift_chain(uuid, date), public.activate_proposal(uuid, int, date, boolean, uuid) to authenticated;
grant execute on function public.portal_open(text), public.portal_respond(text, uuid, text) to anon, authenticated;
revoke execute on function public.run_scheduled_scans() from public, anon, authenticated;
grant execute on function public.run_scheduled_scans() to service_role;
