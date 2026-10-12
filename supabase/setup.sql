-- ORBIAHUB: instalação completa do banco (cole tudo no SQL Editor do Supabase e clique em Run).
-- Gerado a partir de supabase/migrations/*.sql, na ordem. Se você já instalou antes, rode só os arquivos novos em supabase/migrations/.

-- ======== 20261010000001_foundation.sql ========
-- GURIA OS — 0001 Fundação multi-tenant: workspaces (um por designer/estúdio), membros, planos, convites, auditoria, alertas.
-- Convenções: texto + CHECK no lugar de ENUM; valores em centavos (bigint); datas de negócio em America/Sao_Paulo.
-- Isolamento: TODA tabela de negócio tem workspace_id e RLS por pertencimento ao workspace (ver app.apply_rls).

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------- helpers genéricos ----------
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function app.br_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'America/Sao_Paulo')::date $$;

create or replace function app.today() returns date
language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function app.norm_phone(p text) returns text language sql immutable as $$
  select case when p is null then null else nullif(
    case when length(regexp_replace(p, '\D', '', 'g')) in (12, 13) and regexp_replace(p, '\D', '', 'g') like '55%'
         then substr(regexp_replace(p, '\D', '', 'g'), 3)
         else regexp_replace(p, '\D', '', 'g') end, '') end
$$;

create or replace function app.norm_email(e text) returns text language sql immutable as $$
  select nullif(lower(btrim(e)), '')
$$;

create or replace function app.new_token() returns text language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- ---------- perfis (um por usuário do Auth) ----------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_profiles_touch before update on public.profiles for each row execute function app.touch_updated_at();

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- ---------- planos ----------
-- Limites nulos = ilimitado. Valores/limites são ponto de partida: ajuste ao seu modelo de venda.
create table public.plans (
  key          text primary key,
  name         text not null,
  price_cents  bigint not null default 0,
  max_members  int,
  max_clients  int,
  sort         int not null default 0
);
insert into public.plans (key, name, price_cents, max_members, max_clients, sort) values
  ('solo',   'Solo',   4900, 1, 30,   1),
  ('studio', 'Estúdio', 9900, 5, null, 2);

-- ---------- workspaces ----------
create table public.workspaces (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 2 and 120),
  slug           text not null unique,
  owner_id       uuid not null references auth.users(id),
  plan           text not null default 'studio' references public.plans(key),
  status         text not null default 'trial' check (status in ('trial','active','past_due','canceled')),
  trial_ends_at  timestamptz not null default now() + interval '14 days',
  billing_ref    text,                       -- id da assinatura no gateway (Asaas/Stripe) quando integrado
  -- dados do profissional (usados em propostas e contratos)
  legal_name     text, document text, email text, phone text, address text, city text,
  website        text, instagram text, logo_url text,
  brand_color    text not null default '#dd00dd' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  tax_rate_pct   numeric(5,2) not null default 0 check (tax_rate_pct between 0 and 100),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_workspaces_touch before update on public.workspaces for each row execute function app.touch_updated_at();

create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner','admin','member')),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id) where active;

create table public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null,
  role          text not null default 'member' check (role in ('admin','member')),
  token         text not null unique default app.new_token(),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create table public.platform_admins (user_id uuid primary key references auth.users(id) on delete cascade);

-- ---------- funções de autorização (security definer: evitam recursão de RLS) ----------
create or replace function app.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid() and active)
$$;
create or replace function app.is_ws_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid() and active and role in ('owner','admin'))
$$;
-- Workspace "aberto" para escrita: assinatura ativa ou teste em andamento. Fora disso, somente leitura (dados nunca ficam presos).
create or replace function app.ws_open(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspaces where id = ws and (status = 'active' or (status = 'trial' and trial_ends_at > now())))
$$;
create or replace function app.can_write(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_member(ws) and app.ws_open(ws)
$$;
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- ---------- RLS padrão por workspace ----------
-- admin_only = true: somente owner/admin leem e escrevem (financeiro, metas, orçamento).
create or replace function app.apply_rls(t text, admin_only boolean default false) returns void
language plpgsql as $$
declare r text := case when admin_only then 'app.is_ws_admin(workspace_id)' else 'app.is_member(workspace_id)' end;
        w text := case when admin_only then 'app.is_ws_admin(workspace_id) and app.ws_open(workspace_id)' else 'app.can_write(workspace_id)' end;
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop policy if exists tenant_select on public.%I', t);
  execute format('drop policy if exists tenant_insert on public.%I', t);
  execute format('drop policy if exists tenant_update on public.%I', t);
  execute format('drop policy if exists tenant_delete on public.%I', t);
  execute format('create policy tenant_select on public.%I for select to authenticated using (%s)', t, r);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check (%s)', t, w);
  execute format('create policy tenant_update on public.%I for update to authenticated using (%s) with check (%s)', t, w, w);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using (%s)', t, w);
  execute format('drop trigger if exists trg_lock_ws on public.%I', t);
  execute format('create trigger trg_lock_ws before update on public.%I for each row execute function app.lock_workspace_id()', t);
end $$;

create or replace function app.lock_workspace_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id não pode ser alterado' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- auditoria ----------
create table public.audit_log (
  id            bigint generated always as identity primary key,
  workspace_id  uuid,
  table_name    text not null,
  record_id     text,
  action        text not null,
  actor_id      uuid,
  old_data      jsonb,
  new_data      jsonb,
  created_at    timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log (workspace_id, created_at desc);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (workspace_id, table_name, record_id, action, actor_id, old_data, new_data)
  values (coalesce((rec->>'workspace_id')::uuid, case when tg_table_name = 'workspaces' then (rec->>'id')::uuid end),
          tg_table_name, rec->>'id', tg_op, auth.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function app.audit_table(t text) returns void language plpgsql as $$
begin
  execute format('drop trigger if exists trg_audit on public.%I', t);
  execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
end $$;

-- ---------- notificações / alertas ----------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete cascade,   -- null = todos (ver audience)
  audience      text check (audience in ('admin')),                       -- 'admin' = só owner/admin; null = qualquer membro
  severity      text not null default 'info' check (severity in ('info','warning','critical')),
  title         text not null,
  body          text,
  link          text,
  dedupe_key    text,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, dedupe_key)
);
create index notifications_ws_idx on public.notifications (workspace_id, created_at desc);

create or replace function app.notify(p_ws uuid, p_title text, p_body text, p_link text, p_severity text default 'info',
                                      p_audience text default null, p_user uuid default null, p_dedupe text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (workspace_id, title, body, link, severity, audience, user_id, dedupe_key)
  values (p_ws, p_title, p_body, p_link, p_severity, p_audience, p_user, p_dedupe)
  on conflict (workspace_id, dedupe_key) do nothing;
end $$;

-- ---------- limites do plano ----------
create or replace function app.enforce_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  if tg_argv[0] = 'clients' then
    select p.max_clients into lim from public.workspaces w join public.plans p on p.key = w.plan where w.id = new.workspace_id;
    select count(*) into cnt from public.clients where workspace_id = new.workspace_id;
  else
    select p.max_members into lim from public.workspaces w join public.plans p on p.key = w.plan where w.id = new.workspace_id;
    select count(*) into cnt from public.workspace_members where workspace_id = new.workspace_id and active;
  end if;
  if lim is not null and cnt >= lim then
    raise exception 'Limite do plano atingido (% %)', lim, case when tg_argv[0] = 'clients' then 'clientes' else 'membros' end using errcode = '53400';
  end if;
  return new;
end $$;
create trigger trg_members_limit before insert on public.workspace_members
  for each row execute function app.enforce_limit('members');

-- ---------- RLS das tabelas de fundação ----------
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and a.active and b.user_id = profiles.id and b.active));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.plans enable row level security;
create policy plans_select on public.plans for select to authenticated using (true);

alter table public.workspaces enable row level security;
create policy ws_select on public.workspaces for select to authenticated using (app.is_member(id) or app.is_platform_admin());
create policy ws_update on public.workspaces for update to authenticated using (app.is_ws_admin(id)) with check (app.is_ws_admin(id));

-- plano/status/trial/owner só mudam via service role ou administrador da plataforma
create or replace function app.guard_workspace() returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and not app.is_platform_admin() then
    if new.plan is distinct from old.plan or new.status is distinct from old.status or new.trial_ends_at is distinct from old.trial_ends_at
       or new.owner_id is distinct from old.owner_id or new.billing_ref is distinct from old.billing_ref or new.slug is distinct from old.slug then
      raise exception 'Plano, status e titularidade só podem ser alterados pelo suporte/cobrança' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_ws_guard before update on public.workspaces for each row execute function app.guard_workspace();
select app.audit_table('workspaces');

alter table public.workspace_members enable row level security;
create policy wm_select on public.workspace_members for select to authenticated using (app.is_member(workspace_id));
create policy wm_update on public.workspace_members for update to authenticated
  using (app.is_ws_admin(workspace_id) and role <> 'owner') with check (app.is_ws_admin(workspace_id) and role <> 'owner');
create policy wm_delete on public.workspace_members for delete to authenticated
  using (app.is_ws_admin(workspace_id) and role <> 'owner');
-- inserção só via RPC (create_workspace / accept_invite)
select app.audit_table('workspace_members');

alter table public.workspace_invites enable row level security;
create policy inv_select on public.workspace_invites for select to authenticated using (app.is_ws_admin(workspace_id));
create policy inv_insert on public.workspace_invites for insert to authenticated with check (app.is_ws_admin(workspace_id) and app.ws_open(workspace_id));
create policy inv_delete on public.workspace_invites for delete to authenticated using (app.is_ws_admin(workspace_id));

alter table public.platform_admins enable row level security;      -- sem policies: só service role

alter table public.audit_log enable row level security;
create policy audit_select on public.audit_log for select to authenticated using (workspace_id is not null and app.is_ws_admin(workspace_id));

alter table public.notifications enable row level security;
create policy notif_select on public.notifications for select to authenticated
  using (app.is_member(workspace_id) and (user_id = auth.uid() or (user_id is null and (audience is null or app.is_ws_admin(workspace_id)))));
create policy notif_update on public.notifications for update to authenticated
  using (app.is_member(workspace_id) and (user_id = auth.uid() or (user_id is null and (audience is null or app.is_ws_admin(workspace_id)))))
  with check (app.is_member(workspace_id));

-- ---------- convites ----------
create or replace function public.invite_public_info(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('workspace', w.name, 'email', i.email, 'role', i.role)
    from public.workspace_invites i join public.workspaces w on w.id = i.workspace_id
   where i.token = p_token and i.accepted_at is null and i.expires_at > now()
$$;

create or replace function public.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invites; me text;
begin
  if auth.uid() is null then raise exception 'login necessário' using errcode = '28000'; end if;
  select * into inv from public.workspace_invites where token = p_token and accepted_at is null and expires_at > now() for update;
  if not found then raise exception 'Convite inválido ou expirado' using errcode = '22023'; end if;
  select email into me from public.profiles where id = auth.uid();
  if app.norm_email(me) is distinct from app.norm_email(inv.email) then
    raise exception 'Este convite foi enviado para outro e-mail' using errcode = '42501';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), inv.role)
  on conflict (workspace_id, user_id) do update set active = true, role = excluded.role;
  update public.workspace_invites set accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end $$;

-- ======== 20261010000002_clients_crm.sql ========
-- GURIA OS — 0002 Clientes e CRM (funil por workspace)

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  company       text, email text, phone text, document text, address text, city text,
  segment       text, instagram text, website text,
  status        text not null default 'ativo' check (status in ('ativo','pausado','encerrado')),
  notes         text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create index clients_ws_idx on public.clients (workspace_id, name);
create trigger trg_clients_touch before update on public.clients for each row execute function app.touch_updated_at();
create trigger trg_clients_limit before insert on public.clients for each row execute function app.enforce_limit('clients');
select app.apply_rls('clients'); select app.audit_table('clients');

create table public.pipeline_stages (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  position      int not null default 0,
  kind          text not null default 'open' check (kind in ('open','won','lost')),
  probability   int not null default 0 check (probability between 0 and 100),
  unique (id, workspace_id)
);
select app.apply_rls('pipeline_stages');

create table public.leads (
  id                      uuid primary key default gen_random_uuid(),
  workspace_id            uuid not null references public.workspaces(id) on delete cascade,
  name                    text not null check (length(btrim(name)) >= 2),
  company                 text, email text, phone text,
  email_norm              text, phone_norm text,
  source                  text, service_interest text,
  potential_value_cents   bigint not null default 0 check (potential_value_cents >= 0),
  stage_id                uuid not null,
  owner_id                uuid references public.profiles(id) on delete set null,
  client_id               uuid,
  notes                   text, next_action text, next_action_at timestamptz,
  lost_reason             text,
  last_contact_at         timestamptz not null default now(),
  closed_at               timestamptz,
  created_by              uuid references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (stage_id, workspace_id) references public.pipeline_stages (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete set null (client_id),
  check (email_norm is not null or phone_norm is not null)
);
create unique index leads_email_uq on public.leads (workspace_id, email_norm) where email_norm is not null;
create unique index leads_phone_uq on public.leads (workspace_id, phone_norm) where phone_norm is not null;
create index leads_stage_idx on public.leads (workspace_id, stage_id);

create or replace function app.leads_before() returns trigger language plpgsql as $$
declare k text;
begin
  new.email_norm := app.norm_email(new.email);
  new.phone_norm := app.norm_phone(new.phone);
  new.updated_at := now();
  select kind into k from public.pipeline_stages where id = new.stage_id;
  if k = 'lost' and nullif(btrim(coalesce(new.lost_reason, '')), '') is null then
    raise exception 'Informe o motivo da perda' using errcode = '23514';
  end if;
  if k in ('won','lost') then new.closed_at := coalesce(new.closed_at, now());
  else new.closed_at := null; if k = 'open' then new.lost_reason := null; end if; end if;
  return new;
end $$;
create trigger trg_leads_before before insert or update on public.leads for each row execute function app.leads_before();
select app.apply_rls('leads'); select app.audit_table('leads');

create table public.lead_interactions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  lead_id       uuid not null,
  kind          text not null default 'nota' check (kind in ('nota','ligacao','whatsapp','email','reuniao')),
  content       text not null check (length(btrim(content)) > 0),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  foreign key (lead_id, workspace_id) references public.leads (id, workspace_id) on delete cascade
);
create index lead_interactions_idx on public.lead_interactions (lead_id, created_at desc);
select app.apply_rls('lead_interactions');

create or replace function app.interaction_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin update public.leads set last_contact_at = now() where id = new.lead_id; return new; end $$;
create trigger trg_interaction_touch after insert on public.lead_interactions for each row execute function app.interaction_touch();

-- Converte um lead em cliente (idempotente). Retorna o id do cliente.
create or replace function public.convert_lead(p_lead uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare l public.leads; cid uuid;
begin
  select * into l from public.leads where id = p_lead;
  if not found or not app.can_write(l.workspace_id) then raise exception 'Lead não encontrado' using errcode = '42501'; end if;
  if l.client_id is not null then return l.client_id; end if;
  insert into public.clients (workspace_id, name, company, email, phone, created_by)
  values (l.workspace_id, coalesce(nullif(l.company, ''), l.name), l.company, l.email, l.phone, auth.uid())
  returning id into cid;
  update public.leads set client_id = cid where id = l.id;
  return cid;
end $$;

-- ======== 20261010000003_proposals_contracts.sql ========
-- GURIA OS — 0003 Propostas comerciais (link público + aceite) e contratos (geração + aceite eletrônico)

create table public.proposals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  number             int not null default 0,
  title              text not null check (length(btrim(title)) >= 2),
  status             text not null default 'rascunho'
                     check (status in ('rascunho','enviada','visualizada','em_negociacao','aceita','recusada','expirada')),
  lead_id            uuid,
  client_id          uuid,
  intro              text, diagnosis text, scope text, exclusions text, timeline text,
  payment_terms      text, closing text,
  valid_until        date,
  contract_months    int not null default 1 check (contract_months between 1 and 60),
  discount_cents     bigint not null default 0 check (discount_cents >= 0),
  one_time_cents     bigint not null default 0,
  monthly_cents      bigint not null default 0,
  total_cents        bigint not null default 0,
  token              text not null unique default app.new_token(),
  sent_at            timestamptz, viewed_at timestamptz,
  accepted_at        timestamptz, accepted_by_name text, accepted_by_email text, accepted_ip text,
  activated_at       timestamptz,
  project_id         uuid,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (lead_id, workspace_id)   references public.leads (id, workspace_id)   on delete set null (lead_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete set null (client_id)
);
create index proposals_ws_idx on public.proposals (workspace_id, status);

create table public.proposal_items (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  proposal_id      uuid not null,
  position         int not null default 0,
  name             text not null check (length(btrim(name)) > 0),
  description      text,
  billing          text not null default 'pontual' check (billing in ('pontual','mensal')),
  quantity         numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id) on delete cascade
);
create index proposal_items_idx on public.proposal_items (proposal_id, position);

create table public.proposal_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  proposal_id   uuid not null,
  kind          text not null,   -- criada | enviada | visualizada | aceita | alteracao_solicitada | ativada
  detail        text, ip text, user_agent text,
  created_at    timestamptz not null default now(),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id) on delete cascade
);
create index proposal_events_idx on public.proposal_events (proposal_id, created_at);

-- número sequencial por workspace + totais recalculados no banco (única autoridade)
create or replace function app.proposals_before() returns trigger language plpgsql as $$
declare one_t bigint; mon bigint;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 7));
    select coalesce(max(number), 0) + 1 into new.number from public.proposals where workspace_id = new.workspace_id;
  else
    if old.status = 'aceita' and (new.title is distinct from old.title or new.discount_cents is distinct from old.discount_cents
       or new.contract_months is distinct from old.contract_months or new.scope is distinct from old.scope) then
      raise exception 'Proposta aceita não pode ser alterada' using errcode = '23514';
    end if;
  end if;
  select coalesce(sum(round(quantity * unit_price_cents)) filter (where billing = 'pontual'), 0),
         coalesce(sum(round(quantity * unit_price_cents)) filter (where billing = 'mensal'), 0)
    into one_t, mon from public.proposal_items where proposal_id = new.id;
  new.one_time_cents := one_t;
  new.monthly_cents := mon;
  new.total_cents := greatest(one_t + mon * new.contract_months - new.discount_cents, 0);
  new.updated_at := now();
  return new;
end $$;
create trigger trg_proposals_before before insert or update on public.proposals for each row execute function app.proposals_before();

create or replace function app.proposal_items_after() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.proposal_id, old.proposal_id); st text;
begin
  select status into st from public.proposals where id = pid;
  if st = 'aceita' then raise exception 'Proposta aceita não pode ser alterada' using errcode = '23514'; end if;
  update public.proposals set updated_at = now() where id = pid;   -- dispara o recálculo
  return coalesce(new, old);
end $$;
create trigger trg_proposal_items_after after insert or update or delete on public.proposal_items for each row execute function app.proposal_items_after();

select app.apply_rls('proposals'); select app.apply_rls('proposal_items'); select app.apply_rls('proposal_events');
select app.audit_table('proposals');

-- Envio: gera evento e move o lead para a etapa de proposta (se houver)
create or replace function app.proposal_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'enviada' and old.status = 'rascunho' then
    new.sent_at := now();
    insert into public.proposal_events (workspace_id, proposal_id, kind) values (new.workspace_id, new.id, 'enviada');
  end if;
  return new;
end $$;
create trigger trg_proposal_status before update of status on public.proposals for each row execute function app.proposal_status_change();

-- ---------- link público: somente via RPC, token de 256 bits ----------
create or replace function public.proposal_public_open(p_token text, p_ip text default null, p_ua text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.proposals; w public.workspaces;
begin
  select * into p from public.proposals where token = p_token and status <> 'rascunho';
  if not found then return null; end if;
  select * into w from public.workspaces where id = p.workspace_id;
  if p.status = 'enviada' then
    update public.proposals set status = 'visualizada', viewed_at = now() where id = p.id;
    p.status := 'visualizada';
    insert into public.proposal_events (workspace_id, proposal_id, kind, ip, user_agent) values (p.workspace_id, p.id, 'visualizada', p_ip, left(p_ua, 300));
    perform app.notify(p.workspace_id, 'Proposta visualizada', p.title, '/propostas/' || p.id, 'info', null, null, 'viewed:' || p.id);
  end if;
  if p.status in ('visualizada','em_negociacao','enviada') and p.valid_until is not null and p.valid_until < app.today() then
    update public.proposals set status = 'expirada' where id = p.id;
    p.status := 'expirada';
  end if;
  return jsonb_build_object(
    'number', p.number, 'title', p.title, 'status', p.status, 'intro', p.intro, 'diagnosis', p.diagnosis, 'scope', p.scope,
    'exclusions', p.exclusions, 'timeline', p.timeline, 'payment_terms', p.payment_terms, 'closing', p.closing,
    'valid_until', p.valid_until, 'contract_months', p.contract_months, 'discount_cents', p.discount_cents,
    'one_time_cents', p.one_time_cents, 'monthly_cents', p.monthly_cents, 'total_cents', p.total_cents,
    'accepted_at', p.accepted_at, 'accepted_by_name', p.accepted_by_name,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'description', i.description, 'billing', i.billing,
                         'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents) order by i.position, i.id)
                       from public.proposal_items i where i.proposal_id = p.id), '[]'::jsonb),
    'brand', jsonb_build_object('name', w.name, 'legal_name', w.legal_name, 'document', w.document, 'email', w.email,
                                'phone', w.phone, 'logo_url', w.logo_url, 'color', w.brand_color, 'instagram', w.instagram, 'city', w.city));
end $$;

create or replace function public.proposal_public_accept(p_token text, p_name text, p_email text, p_ip text default null, p_ua text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.proposals; l public.leads; cid uuid; won uuid;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'nome e e-mail válidos são obrigatórios' using errcode = '22023';
  end if;
  select * into p from public.proposals where token = p_token for update;
  if not found or p.status not in ('enviada','visualizada','em_negociacao') then return false; end if;
  if p.valid_until is not null and p.valid_until < app.today() then
    update public.proposals set status = 'expirada' where id = p.id; return false;
  end if;
  cid := p.client_id;
  if cid is null and p.lead_id is not null then
    select * into l from public.leads where id = p.lead_id;
    insert into public.clients (workspace_id, name, company, email, phone)
    values (p.workspace_id, coalesce(nullif(l.company, ''), l.name), l.company, coalesce(l.email, lower(p_email)), l.phone) returning id into cid;
    update public.leads set client_id = cid where id = l.id;
  elsif cid is null then
    insert into public.clients (workspace_id, name, email) values (p.workspace_id, btrim(p_name), lower(btrim(p_email))) returning id into cid;
  end if;
  select id into won from public.pipeline_stages where workspace_id = p.workspace_id and kind = 'won' order by position limit 1;
  if p.lead_id is not null and won is not null then update public.leads set stage_id = won where id = p.lead_id; end if;
  update public.proposals set status = 'aceita', accepted_at = now(), accepted_by_name = btrim(p_name),
         accepted_by_email = lower(btrim(p_email)), accepted_ip = p_ip, client_id = cid where id = p.id;
  insert into public.proposal_events (workspace_id, proposal_id, kind, detail, ip, user_agent)
  values (p.workspace_id, p.id, 'aceita', btrim(p_name) || ' <' || lower(btrim(p_email)) || '>', p_ip, left(p_ua, 300));
  perform app.notify(p.workspace_id, 'Proposta aceita 🎉', p.title || ' — gere o contrato e ative o financeiro.', '/propostas/' || p.id, 'info', null, null, 'accepted:' || p.id);
  return true;
end $$;

create or replace function public.proposal_public_request_changes(p_token text, p_name text, p_message text, p_ip text default null, p_ua text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.proposals;
begin
  if nullif(btrim(coalesce(p_message, '')), '') is null then raise exception 'mensagem obrigatória' using errcode = '22023'; end if;
  select * into p from public.proposals where token = p_token for update;
  if not found or p.status not in ('enviada','visualizada','em_negociacao') then return false; end if;
  update public.proposals set status = 'em_negociacao' where id = p.id;
  insert into public.proposal_events (workspace_id, proposal_id, kind, detail, ip, user_agent)
  values (p.workspace_id, p.id, 'alteracao_solicitada', left(coalesce(p_name, '') || ': ' || p_message, 2000), p_ip, left(p_ua, 300));
  perform app.notify(p.workspace_id, 'Cliente pediu alterações', p.title, '/propostas/' || p.id, 'warning', null, null, 'changes:' || p.id || ':' || extract(epoch from now())::bigint);
  return true;
end $$;

-- ---------- contratos ----------
create table public.contract_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  body          text not null,
  created_at    timestamptz not null default now()
);
select app.apply_rls('contract_templates');

create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  number          int not null default 0,
  title           text not null check (length(btrim(title)) >= 2),
  client_id       uuid,
  proposal_id     uuid,
  body            text not null,
  status          text not null default 'rascunho' check (status in ('rascunho','enviado','assinado','cancelado')),
  start_date      date, end_date date,
  value_cents     bigint not null default 0,
  token           text not null unique default app.new_token(),
  sent_at         timestamptz,
  signed_at       timestamptz, signed_name text, signed_document text, signed_ip text, signed_ua text, body_hash text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id)   references public.clients (id, workspace_id)   on delete set null (client_id),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id) on delete set null (proposal_id)
);
create index contracts_ws_idx on public.contracts (workspace_id, status);

create or replace function app.contracts_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 8));
    select coalesce(max(number), 0) + 1 into new.number from public.contracts where workspace_id = new.workspace_id;
  else
    if old.status in ('enviado','assinado') and new.body is distinct from old.body then
      raise exception 'Texto bloqueado após o envio. Cancele e gere um novo contrato.' using errcode = '23514';
    end if;
    if old.status = 'assinado' and new.status <> 'assinado' and new.status <> 'cancelado' then
      raise exception 'Contrato assinado só pode ser cancelado' using errcode = '23514';
    end if;
    if new.status = 'enviado' and old.status = 'rascunho' then new.sent_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_contracts_before before insert or update on public.contracts for each row execute function app.contracts_before();
select app.apply_rls('contracts'); select app.audit_table('contracts');

create or replace function public.contract_public_open(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', c.number, 'title', c.title, 'body', c.body, 'status', c.status, 'signed_at', c.signed_at,
         'signed_name', c.signed_name, 'body_hash', c.body_hash,
         'brand', jsonb_build_object('name', w.name, 'legal_name', w.legal_name, 'document', w.document, 'logo_url', w.logo_url, 'color', w.brand_color))
    from public.contracts c join public.workspaces w on w.id = c.workspace_id
   where c.token = p_token and c.status in ('enviado','assinado')
$$;

-- Aceite eletrônico simples (Lei 14.063/2020): nome, documento, data/hora, IP, agente e hash do texto como evidência.
create or replace function public.contract_public_sign(p_token text, p_name text, p_document text, p_ip text default null, p_ua text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null or length(regexp_replace(coalesce(p_document, ''), '\D', '', 'g')) not in (11, 14) then
    raise exception 'nome e CPF/CNPJ válidos são obrigatórios' using errcode = '22023';
  end if;
  select * into c from public.contracts where token = p_token for update;
  if not found or c.status <> 'enviado' then return false; end if;
  update public.contracts set status = 'assinado', signed_at = now(), signed_name = btrim(p_name),
         signed_document = regexp_replace(p_document, '\D', '', 'g'), signed_ip = p_ip, signed_ua = left(p_ua, 300),
         body_hash = encode(sha256(convert_to(c.body, 'UTF8')), 'hex')
   where id = c.id;
  perform app.notify(c.workspace_id, 'Contrato assinado ✍️', c.title, '/contratos/' || c.id, 'info', null, null, 'signed:' || c.id);
  return true;
end $$;

-- ======== 20261010000004_projects_tasks_content_ads.sql ========
-- GURIA OS — 0004 Projetos, tarefas/prazos, planejamento de conteúdo e tráfego pago

-- ---------- projetos e tarefas ----------
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  client_id     uuid,
  status        text not null default 'em_andamento' check (status in ('planejado','em_andamento','pausado','concluido','cancelado')),
  start_date    date, due_date date,
  description   text,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete set null (client_id)
);
create trigger trg_projects_touch before update on public.projects for each row execute function app.touch_updated_at();
select app.apply_rls('projects'); select app.audit_table('projects');

alter table public.proposals add foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete set null (project_id);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  title         text not null check (length(btrim(title)) >= 2),
  description   text,
  status        text not null default 'a_fazer' check (status in ('a_fazer','fazendo','revisao','feito')),
  priority      text not null default 'media' check (priority in ('baixa','media','alta','urgente')),
  due_date      date,
  project_id    uuid, client_id uuid, lead_id uuid,
  assignee_id   uuid references public.profiles(id) on delete set null,
  completed_at  timestamptz,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (project_id, workspace_id) references public.projects (id, workspace_id) on delete set null (project_id),
  foreign key (client_id, workspace_id)  references public.clients (id, workspace_id)  on delete set null (client_id),
  foreign key (lead_id, workspace_id)    references public.leads (id, workspace_id)    on delete set null (lead_id)
);
create index tasks_ws_idx on public.tasks (workspace_id, status, due_date);
create or replace function app.tasks_before() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'feito' then new.completed_at := coalesce(new.completed_at, now()); else new.completed_at := null; end if;
  return new;
end $$;
create trigger trg_tasks_before before insert or update on public.tasks for each row execute function app.tasks_before();
select app.apply_rls('tasks');

-- ---------- planejamento de conteúdo por rede social ----------
create table public.content_pillars (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  client_id     uuid,                      -- null = seus próprios perfis
  name          text not null check (length(btrim(name)) >= 2),
  description   text,
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete cascade
);
select app.apply_rls('content_pillars');

create table public.content_posts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  client_id     uuid,                      -- null = conteúdo próprio
  network       text not null check (network in ('instagram','tiktok','linkedin','youtube','pinterest','facebook','x','threads','blog')),
  format        text not null default 'feed' check (format in ('feed','carrossel','reels','story','video','artigo','thread','outro')),
  title         text not null check (length(btrim(title)) >= 2),
  pillar_id     uuid,
  hook          text, caption text, cta text, hashtags text, visual_notes text, post_url text,
  status        text not null default 'ideia' check (status in ('ideia','roteiro','criacao','aprovacao','agendado','publicado')),
  publish_date  date,
  assignee_id   uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete set null (client_id),
  foreign key (pillar_id, workspace_id) references public.content_pillars (id, workspace_id) on delete set null (pillar_id)
);
create index content_posts_ws_idx on public.content_posts (workspace_id, publish_date);
create trigger trg_content_touch before update on public.content_posts for each row execute function app.touch_updated_at();
select app.apply_rls('content_posts');

-- ---------- tráfego pago ----------
-- Métricas são lançadas manualmente ou importadas por CSV. Integração direta com Meta/Google Ads exige app aprovado
-- e tokens por cliente: ver docs/ARQUITETURA.md (fase 3). Nada aqui simula dados de plataforma.
create table public.ad_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  client_id           uuid,
  platform            text not null check (platform in ('meta','google','tiktok','linkedin','pinterest','outro')),
  name                text not null check (length(btrim(name)) >= 2),
  objective           text check (objective in ('leads','vendas','trafego','reconhecimento','engajamento','mensagens')),
  status              text not null default 'ativa' check (status in ('planejada','ativa','pausada','encerrada')),
  daily_budget_cents  bigint not null default 0 check (daily_budget_cents >= 0),
  start_date          date, end_date date,
  target_cpl_cents    bigint check (target_cpl_cents >= 0),     -- meta de custo por lead (gera alerta)
  notes               text,
  created_at          timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete set null (client_id)
);
select app.apply_rls('ad_campaigns'); select app.audit_table('ad_campaigns');

create table public.ad_metrics_daily (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  campaign_id    uuid not null,
  day            date not null,
  spend_cents    bigint not null default 0 check (spend_cents >= 0),
  impressions    bigint not null default 0 check (impressions >= 0),
  clicks         bigint not null default 0 check (clicks >= 0),
  leads          bigint not null default 0 check (leads >= 0),
  conversions    bigint not null default 0 check (conversions >= 0),
  revenue_cents  bigint not null default 0 check (revenue_cents >= 0),
  unique (campaign_id, day),
  foreign key (campaign_id, workspace_id) references public.ad_campaigns (id, workspace_id) on delete cascade
);
create index ad_metrics_ws_idx on public.ad_metrics_daily (workspace_id, day);
select app.apply_rls('ad_metrics_daily');

-- ======== 20261010000005_finance_goals_automation.sql ========
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

-- ======== 20261011000006_branding_storage.sql ========
-- GURIA OS — 0006 Logotipo do estúdio e avatar do usuário (Supabase Storage)
-- Bucket público "branding" (logos aparecem em propostas/contratos públicos). Caminhos:
--   ws/<workspace_id>/arquivo   → só owner/admin do workspace (e workspace aberto) escrevem
--   users/<user_id>/arquivo     → só o próprio usuário escreve
-- Apenas PNG/JPEG/WebP até 2 MB (SVG fica de fora de propósito: pode conter script).

alter table public.profiles add column if not exists avatar_url text;

create or replace function app.can_manage_branding(obj_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(obj_name, '/');
begin
  if array_length(parts, 1) < 3 then return false; end if;
  if parts[1] = 'users' then return parts[2] = auth.uid()::text; end if;
  if parts[1] = 'ws' and parts[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return app.is_ws_admin(parts[2]::uuid) and app.ws_open(parts[2]::uuid);
  end if;
  return false;
end $$;
grant execute on function app.can_manage_branding(text) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Schema storage não encontrado: pulei bucket/políticas (rode no Supabase).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

  drop policy if exists branding_insert on storage.objects;
  drop policy if exists branding_update on storage.objects;
  drop policy if exists branding_delete on storage.objects;
  drop policy if exists branding_select on storage.objects;
  create policy branding_insert on storage.objects for insert to authenticated with check (bucket_id = 'branding' and app.can_manage_branding(name));
  create policy branding_update on storage.objects for update to authenticated using (bucket_id = 'branding' and app.can_manage_branding(name)) with check (bucket_id = 'branding' and app.can_manage_branding(name));
  create policy branding_delete on storage.objects for delete to authenticated using (bucket_id = 'branding' and app.can_manage_branding(name));
  create policy branding_select on storage.objects for select to authenticated using (bucket_id = 'branding' and app.can_manage_branding(name));
end $$;

-- ======== 20261011000007_task_attachments.sql ========
-- GURIA OS — 0007 Anexos de tarefas: arquivos (Supabase Storage, bucket privado) e links (Google Drive, Figma, etc.)
-- Arquivos: ws/<workspace_id>/tasks/<task_id>/<uuid>-<nome>. Leitura: membros; escrita: membros com workspace aberto.

create table if not exists public.task_attachments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  task_id       uuid not null,
  kind          text not null check (kind in ('arquivo', 'link')),
  provider      text not null default 'upload' check (provider in ('upload', 'google_drive', 'outro')),
  name          text not null check (length(btrim(name)) > 0),
  url           text,                      -- links
  path          text,                      -- arquivos (caminho no bucket)
  mime          text,
  size_bytes    bigint check (size_bytes >= 0),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  foreign key (task_id, workspace_id) references public.tasks (id, workspace_id) on delete cascade,
  check ((kind = 'arquivo' and path is not null) or (kind = 'link' and url ~* '^https?://')),
  check (path is null or path like 'ws/' || workspace_id::text || '/tasks/' || task_id::text || '/%')
);
create index if not exists task_attachments_idx on public.task_attachments (task_id, created_at);
select app.apply_rls('task_attachments');
grant select, insert, update, delete on public.task_attachments to authenticated;
grant all on public.task_attachments to service_role;

create or replace function app.can_access_attachment(obj_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(obj_name, '/');
begin
  if array_length(parts, 1) < 5 or parts[1] <> 'ws' or parts[3] <> 'tasks' then return false; end if;
  if parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return case when p_write then app.can_write(parts[2]::uuid) else app.is_member(parts[2]::uuid) end;
end $$;
grant execute on function app.can_access_attachment(text, boolean) to authenticated;

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Schema storage não encontrado: pulei bucket/políticas (rode no Supabase).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit)
  values ('attachments', 'attachments', false, 26214400)          -- privado, 25 MB por arquivo
  on conflict (id) do update set public = false, file_size_limit = 26214400;

  drop policy if exists attachments_select on storage.objects;
  drop policy if exists attachments_insert on storage.objects;
  drop policy if exists attachments_update on storage.objects;
  drop policy if exists attachments_delete on storage.objects;
  create policy attachments_select on storage.objects for select to authenticated using (bucket_id = 'attachments' and app.can_access_attachment(name, false));
  create policy attachments_insert on storage.objects for insert to authenticated with check (bucket_id = 'attachments' and app.can_access_attachment(name, true));
  create policy attachments_update on storage.objects for update to authenticated using (bucket_id = 'attachments' and app.can_access_attachment(name, true)) with check (bucket_id = 'attachments' and app.can_access_attachment(name, true));
  create policy attachments_delete on storage.objects for delete to authenticated using (bucket_id = 'attachments' and app.can_access_attachment(name, true));
end $$;

-- ======== 20261012000008_content_planning.sql ========
-- GURIA OS — 0008 Planejamento de conteúdo: pilares, campanhas, calendário editorial, Kanban de produção, detalhe do post,
-- histórico, anexos e importação controlada (ensaio + aplicação idempotente).
-- ADITIVA: evolui content_pillars/content_posts existentes. Nada é apagado; só as etapas antigas são renomeadas
-- (criacao → producao, aprovacao → revisao) e posts manuais sem data passam para o grupo "ideia".

-- ---------- pilares ----------
alter table public.content_pillars
  add column if not exists external_id text,
  add column if not exists objective text,
  add column if not exists color text not null default '#B00BB5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists position int not null default 0,
  add column if not exists active boolean not null default true,
  add column if not exists source_import text,
  add column if not exists import_hash text,
  add column if not exists manually_edited_at timestamptz,
  add column if not exists created_at timestamptz not null default now();
create unique index if not exists content_pillars_ext_uq on public.content_pillars (workspace_id, external_id) where external_id is not null;

-- ---------- campanhas / editorias transversais (tags; NÃO são pilares) ----------
create table if not exists public.content_campaigns (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  external_id   text,
  name          text not null check (length(btrim(name)) >= 2),
  period        text,
  kind          text,
  status        text,
  notes         text,
  active        boolean not null default true,
  source_import text, import_hash text, manually_edited_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index if not exists content_campaigns_ext_uq on public.content_campaigns (workspace_id, external_id) where external_id is not null;
select app.apply_rls('content_campaigns');
grant select, insert, update, delete on public.content_campaigns to authenticated;
grant all on public.content_campaigns to service_role;

-- ---------- posts ----------
-- etapas novas: ideia, roteiro, producao, revisao, aprovado, agendado (na plataforma), publicado
do $$
declare c text;
begin
  select conname into c from pg_constraint where conrelid = 'public.content_posts'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%ideia%';
  if c is not null then execute format('alter table public.content_posts drop constraint %I', c); end if;
end $$;
update public.content_posts set status = 'producao' where status = 'criacao';
update public.content_posts set status = 'revisao' where status = 'aprovacao';
alter table public.content_posts add constraint content_posts_status_check check (status in ('ideia', 'roteiro', 'producao', 'revisao', 'aprovado', 'agendado', 'publicado'));

alter table public.content_posts
  add column if not exists external_id text,
  add column if not exists source_import text,
  add column if not exists import_hash text,
  add column if not exists manually_edited_at timestamptz,
  add column if not exists bucket text not null default 'calendario' check (bucket in ('calendario', 'acervo', 'ideia', 'remanejado')),
  add column if not exists category text,
  add column if not exists concept text,
  add column if not exists keyword text,
  add column if not exists priority text not null default 'media' check (priority in ('baixa', 'media', 'alta', 'urgente')),
  add column if not exists cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) in (0, 7)),
  add column if not exists reels jsonb,
  add column if not exists stories jsonb,
  add column if not exists manychat jsonb check (manychat is null or coalesce((manychat->>'enabled')::boolean, false) = false),  -- sem integração: nunca "ativo"
  add column if not exists image_prompt text,
  add column if not exists cover_cta text,
  add column if not exists checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  add column if not exists review_required boolean not null default false,
  add column if not exists collection text,
  add column if not exists extra jsonb not null default '{}'::jsonb,
  add column if not exists internal_notes text,
  add column if not exists platform_scheduled_at timestamptz,      -- só quando realmente agendado na plataforma
  add column if not exists published_at timestamptz,               -- data/hora REAIS da publicação (nunca inferida da data editorial)
  add column if not exists published_confirmed_at timestamptz,
  add column if not exists published_confirmed_by uuid references public.profiles(id) on delete set null;
-- indicadores baratos para listas/Kanban (evitam trazer cards/prompt/ManyChat inteiros)
alter table public.content_posts
  add column if not exists cards_count int generated always as (jsonb_array_length(cards)) stored,
  add column if not exists has_caption boolean generated always as (coalesce(length(btrim(caption)), 0) > 0) stored,
  add column if not exists has_prompt boolean generated always as (coalesce(length(btrim(image_prompt)), 0) > 0) stored,
  add column if not exists has_manychat boolean generated always as (manychat is not null) stored;
-- posts manuais antigos sem data viram "ideia" (não são calendário)
update public.content_posts set bucket = 'ideia' where publish_date is null and bucket = 'calendario' and external_id is null;
create unique index if not exists content_posts_ext_uq on public.content_posts (workspace_id, external_id) where external_id is not null;
create index if not exists content_posts_bucket_idx on public.content_posts (workspace_id, bucket, status);

create table if not exists public.content_post_campaigns (
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  post_id       uuid not null,
  campaign_id   uuid not null,
  primary key (post_id, campaign_id),
  foreign key (post_id, workspace_id) references public.content_posts (id, workspace_id) on delete cascade,
  foreign key (campaign_id, workspace_id) references public.content_campaigns (id, workspace_id) on delete cascade
);
select app.apply_rls('content_post_campaigns');
grant select, insert, update, delete on public.content_post_campaigns to authenticated;
grant all on public.content_post_campaigns to service_role;

-- ---------- histórico ----------
create table if not exists public.content_post_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  post_id       uuid not null,
  kind          text not null,        -- criado | status | reagendado | editado | publicado | importado
  detail        jsonb not null default '{}'::jsonb,
  actor_id      uuid,
  created_at    timestamptz not null default now(),
  foreign key (post_id, workspace_id) references public.content_posts (id, workspace_id) on delete cascade
);
create index if not exists content_post_events_idx on public.content_post_events (post_id, created_at desc);
alter table public.content_post_events enable row level security;
drop policy if exists cpe_select on public.content_post_events;
create policy cpe_select on public.content_post_events for select to authenticated using (app.is_member(workspace_id));   -- só leitura: gravado por trigger
grant select on public.content_post_events to authenticated;
grant all on public.content_post_events to service_role;

-- ---------- regras de negócio no banco ----------
create or replace function app.content_posts_guard() returns trigger language plpgsql as $$
declare importing boolean := coalesce(current_setting('app.importing', true), '') = 'on';
        changed text[] := '{}';
begin
  -- definir uma data tira o item do acervo (ação explícita); sem data nunca fica no calendário por inferência
  if new.publish_date is not null and new.bucket <> 'calendario' then new.bucket := 'calendario'; end if;
  -- publicado exige data/hora reais e registra quem confirmou
  if new.status = 'publicado' then
    if (tg_op = 'INSERT' or old.status <> 'publicado') then
      if new.published_at is null then raise exception 'Informe a data e hora reais da publicação para marcar como publicado' using errcode = '23514'; end if;
      new.published_confirmed_at := now(); new.published_confirmed_by := auth.uid();
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'publicado' then
    new.published_at := null; new.published_confirmed_at := null; new.published_confirmed_by := null;
  end if;
  if new.status = 'agendado' and tg_op = 'UPDATE' and old.status <> 'agendado' and new.platform_scheduled_at is null then
    null;   -- data de agendamento na plataforma é opcional (o sistema não agenda nada sozinho)
  end if;
  if tg_op = 'UPDATE' then
    if new.title is distinct from old.title then changed := array_append(changed, 'title'); end if;
    if new.hook is distinct from old.hook then changed := array_append(changed, 'hook'); end if;
    if new.concept is distinct from old.concept then changed := array_append(changed, 'concept'); end if;
    if new.keyword is distinct from old.keyword then changed := array_append(changed, 'keyword'); end if;
    if new.category is distinct from old.category then changed := array_append(changed, 'category'); end if;
    if new.caption is distinct from old.caption then changed := array_append(changed, 'caption'); end if;
    if new.image_prompt is distinct from old.image_prompt then changed := array_append(changed, 'image_prompt'); end if;
    if new.cover_cta is distinct from old.cover_cta then changed := array_append(changed, 'cover_cta'); end if;
    if new.cta is distinct from old.cta then changed := array_append(changed, 'cta'); end if;
    if new.cards is distinct from old.cards then changed := array_append(changed, 'cards'); end if;
    if new.reels is distinct from old.reels then changed := array_append(changed, 'reels'); end if;
    if new.stories is distinct from old.stories then changed := array_append(changed, 'stories'); end if;
    if new.manychat is distinct from old.manychat then changed := array_append(changed, 'manychat'); end if;
    if new.visual_notes is distinct from old.visual_notes then changed := array_append(changed, 'visual_notes'); end if;
    if new.pillar_id is distinct from old.pillar_id then changed := array_append(changed, 'pillar'); end if;
    if new.extra is distinct from old.extra then changed := array_append(changed, 'extra'); end if;
    if cardinality(changed) > 0 and not importing then new.manually_edited_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_content_guard on public.content_posts;
create trigger trg_content_guard before insert or update on public.content_posts for each row execute function app.content_posts_guard();

create or replace function app.content_posts_events() returns trigger language plpgsql security definer set search_path = public as $$
declare changed text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into public.content_post_events (workspace_id, post_id, kind, detail, actor_id)
    values (new.workspace_id, new.id, case when new.external_id is not null and coalesce(current_setting('app.importing', true), '') = 'on' then 'importado' else 'criado' end,
            jsonb_build_object('status', new.status, 'bucket', new.bucket), auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.content_post_events (workspace_id, post_id, kind, detail, actor_id)
    values (new.workspace_id, new.id, case when new.status = 'publicado' then 'publicado' else 'status' end,
            jsonb_build_object('de', old.status, 'para', new.status, 'published_at', new.published_at), auth.uid());
  end if;
  if new.publish_date is distinct from old.publish_date then
    insert into public.content_post_events (workspace_id, post_id, kind, detail, actor_id)
    values (new.workspace_id, new.id, 'reagendado', jsonb_build_object('de', old.publish_date, 'para', new.publish_date), auth.uid());
  end if;
  if new.manually_edited_at is distinct from old.manually_edited_at and new.manually_edited_at is not null then
    insert into public.content_post_events (workspace_id, post_id, kind, detail, actor_id) values (new.workspace_id, new.id, 'editado', '{}'::jsonb, auth.uid());
  elsif coalesce(current_setting('app.importing', true), '') = 'on' and new.import_hash is distinct from old.import_hash then
    insert into public.content_post_events (workspace_id, post_id, kind, detail, actor_id) values (new.workspace_id, new.id, 'importado', jsonb_build_object('atualizado', true), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_content_events on public.content_posts;
create trigger trg_content_events after insert or update on public.content_posts for each row execute function app.content_posts_events();

create or replace function app.content_simple_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('app.importing', true), '') <> 'on'
     and (to_jsonb(new) - 'manually_edited_at' - 'import_hash') is distinct from (to_jsonb(old) - 'manually_edited_at' - 'import_hash') then
    new.manually_edited_at := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_pillars_guard on public.content_pillars;
create trigger trg_pillars_guard before update on public.content_pillars for each row execute function app.content_simple_guard();
drop trigger if exists trg_campaigns_guard on public.content_campaigns;
create trigger trg_campaigns_guard before update on public.content_campaigns for each row execute function app.content_simple_guard();

-- ---------- anexos dos posts (reusa o bucket privado "attachments") ----------
create table if not exists public.content_attachments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  post_id       uuid not null,
  kind          text not null check (kind in ('arquivo', 'link')),
  provider      text not null default 'upload' check (provider in ('upload', 'google_drive', 'outro')),
  name          text not null check (length(btrim(name)) > 0),
  url           text, path text, mime text,
  size_bytes    bigint check (size_bytes >= 0),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  foreign key (post_id, workspace_id) references public.content_posts (id, workspace_id) on delete cascade,
  check ((kind = 'arquivo' and path is not null) or (kind = 'link' and url ~* '^https?://')),
  check (path is null or path like 'ws/' || workspace_id::text || '/content/' || post_id::text || '/%')
);
create index if not exists content_attachments_idx on public.content_attachments (post_id, created_at);
select app.apply_rls('content_attachments');
grant select, insert, update, delete on public.content_attachments to authenticated;
grant all on public.content_attachments to service_role;

create or replace function app.can_access_attachment(obj_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(obj_name, '/');
begin
  if array_length(parts, 1) < 5 or parts[1] <> 'ws' or parts[3] not in ('tasks', 'content') then return false; end if;
  if parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return case when p_write then app.can_write(parts[2]::uuid) else app.is_member(parts[2]::uuid) end;
end $$;

-- ---------- importação controlada ----------
create table if not exists public.content_import_runs (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  status        text not null default 'ensaio' check (status in ('ensaio', 'aplicada', 'descartada')),
  file_name     text,
  payload       jsonb,               -- guardado só até aplicar/descartar
  payload_hash  text,
  report        jsonb not null default '{}'::jsonb,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  applied_at    timestamptz
);
select app.apply_rls('content_import_runs', true);
grant select, insert, update, delete on public.content_import_runs to authenticated;
grant all on public.content_import_runs to service_role;

-- Núcleo: calcula (p_apply = false) ou aplica (p_apply = true) o plano. Upsert por external_id + workspace; idempotente.
-- Regras: não sobrescreve item editado manualmente (reporta conflito); não cria publicado/agendado; ManyChat sempre desativado;
-- itens de acervo/ideias ficam sem data; nunca inventa links nem datas.
create or replace function app.content_import(p_ws uuid, p_plan jsonb, p_apply boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  conflicts jsonb := '[]'; incompat jsonb := '[]'; warns jsonb := '[]'; reused jsonb := '[]'; checks jsonb := '[]';
  pil_c int := 0; pil_u int := 0; pil_n int := 0; pil_x int := 0; cam_c int := 0; cam_u int := 0; cam_n int := 0; cam_x int := 0;
  pst_c int := 0; pst_u int := 0; pst_n int := 0; pst_x int := 0; pst_i int := 0;
  pmap jsonb := '{}'; cmap jsonb := '{}';
  pids text[] := '{}'; cids text[] := '{}';
  it jsonb; ex record; h text; ext text; v_bucket text; lst text; stage text; problems text[]; newid uuid; pid uuid; cr text; cid uuid;
  by_bucket jsonb := '{"calendario":0,"acervo":0,"remanejado":0,"ideia":0}'; by_month jsonb := '{}'; by_pillar jsonb := '{}'; m int; d date; plan_cnt jsonb := coalesce(p_plan->'counts', '{}'::jsonb);
  st text; pr text; mc jsonb;
  stages text[] := array['ideia', 'roteiro', 'producao', 'revisao', 'aprovado', 'agendado', 'publicado'];
  lists text[][] := array[['scheduled_posts', 'calendario'], ['reserve_nostalgia', 'acervo'], ['reserve_full_posts', 'remanejado'], ['backlog_ideas_not_scheduled', 'ideia']];
  i int; n_sched int; n_res int; n_rem int; n_back int;
begin
  if jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan->'scheduled_posts') <> 'array' or jsonb_typeof(p_plan->'pillars') <> 'array' then
    raise exception 'Arquivo inválido: faltam as listas scheduled_posts e pillars' using errcode = '22023';
  end if;
  if p_apply then perform set_config('app.importing', 'on', true); end if;

  -- ===== pilares =====
  for it in select value from jsonb_array_elements(p_plan->'pillars') loop
    ext := it->>'id'; h := md5(it::text); pids := array_append(pids, ext);
    select * into ex from public.content_pillars where workspace_id = p_ws and external_id = ext;
    if found then
      pmap := pmap || jsonb_build_object(ext, ex.id);
      if ex.import_hash = h then pil_n := pil_n + 1;
      elsif ex.manually_edited_at is not null then pil_x := pil_x + 1; conflicts := conflicts || jsonb_build_object('tipo', 'pilar', 'id', ext, 'titulo', it->>'name', 'motivo', 'editado manualmente depois da importação: não foi sobrescrito');
      else pil_u := pil_u + 1;
        if p_apply then update public.content_pillars set name = it->>'name', description = it->>'description', objective = it->>'objective', color = coalesce(it->>'color', color), position = coalesce((it->>'order')::int, position), import_hash = h where id = ex.id; end if;
      end if;
    else
      select * into ex from public.content_pillars where workspace_id = p_ws and external_id is null and lower(name) = lower(it->>'name') limit 1;
      if found then   -- pilar manual com o mesmo nome: reutiliza sem alterar
        pmap := pmap || jsonb_build_object(ext, ex.id); reused := reused || jsonb_build_object('tipo', 'pilar', 'id', ext, 'titulo', it->>'name', 'motivo', 'já existe um pilar manual com este nome: reutilizado sem alterações');
      else pil_c := pil_c + 1;
        if p_apply then
          insert into public.content_pillars (workspace_id, external_id, name, description, objective, color, position, source_import, import_hash)
          values (p_ws, ext, it->>'name', it->>'description', it->>'objective', coalesce(it->>'color', '#B00BB5'), coalesce((it->>'order')::int, 0), p_plan->'scheduled_posts'->0->>'source_import', h) returning id into newid;
          pmap := pmap || jsonb_build_object(ext, newid);
        end if;
      end if;
    end if;
  end loop;

  -- ===== campanhas =====
  for it in select value from jsonb_array_elements(coalesce(p_plan->'editorial_campaigns', '[]')) loop
    ext := it->>'id'; h := md5(it::text); cids := array_append(cids, ext);
    select * into ex from public.content_campaigns where workspace_id = p_ws and external_id = ext;
    if found then
      cmap := cmap || jsonb_build_object(ext, ex.id);
      if ex.import_hash = h then cam_n := cam_n + 1;
      elsif ex.manually_edited_at is not null then cam_x := cam_x + 1; conflicts := conflicts || jsonb_build_object('tipo', 'campanha', 'id', ext, 'titulo', it->>'name', 'motivo', 'editada manualmente: não foi sobrescrita');
      else cam_u := cam_u + 1;
        if p_apply then update public.content_campaigns set name = it->>'name', period = it->>'period', kind = it->>'type', status = it->>'status', notes = it->>'notes', import_hash = h where id = ex.id; end if;
      end if;
    else
      select * into ex from public.content_campaigns where workspace_id = p_ws and external_id is null and lower(name) = lower(it->>'name') limit 1;
      if found then cmap := cmap || jsonb_build_object(ext, ex.id); reused := reused || jsonb_build_object('tipo', 'campanha', 'id', ext, 'titulo', it->>'name', 'motivo', 'já existe uma campanha manual com este nome: reutilizada');
      else cam_c := cam_c + 1;
        if p_apply then
          insert into public.content_campaigns (workspace_id, external_id, name, period, kind, status, notes, source_import, import_hash)
          values (p_ws, ext, it->>'name', it->>'period', it->>'type', it->>'status', it->>'notes', 'guria-os-2026-editorial-v2', h) returning id into newid;
          cmap := cmap || jsonb_build_object(ext, newid);
        end if;
      end if;
    end if;
  end loop;

  -- ===== posts =====
  for i in 1..array_length(lists, 1) loop
    lst := lists[i][1]; v_bucket := lists[i][2];
    for it in select value from jsonb_array_elements(coalesce(p_plan->lst, '[]')) loop
      ext := it->>'id'; h := md5(it::text); problems := '{}'; stage := coalesce(it->>'kanban_stage', 'ideia'); mc := it->'manychat';
      if ext is null then problems := array_append(problems, 'sem id'); end if;
      if coalesce(it->>'title', '') = '' then problems := array_append(problems, 'sem título'); end if;
      if not coalesce(it->>'pillar_id' = any (pids), false) then problems := array_append(problems, format('pilar desconhecido (%s)', it->>'pillar_id')); end if;
      if exists (select 1 from jsonb_array_elements_text(coalesce(it->'campaign_ids', '[]')) c where c <> all (cids)) then problems := array_append(problems, 'campanha desconhecida'); end if;
      if not (stage = any (stages)) then problems := array_append(problems, format('etapa desconhecida (%s)', stage));
      elsif stage in ('agendado', 'publicado') then problems := array_append(problems, 'etapa agendado/publicado não pode ser importada'); end if;
      if coalesce((it->>'published')::boolean, false) or it->>'published_at' is not null or it->>'platform_scheduled_at' is not null then problems := array_append(problems, 'item marcado como publicado/agendado na origem'); end if;
      if v_bucket in ('calendario', 'acervo', 'remanejado') and jsonb_array_length(coalesce(it->'cards', '[]')) <> 7 then problems := array_append(problems, format('carrossel com %s cards (esperado 7)', jsonb_array_length(coalesce(it->'cards', '[]')))); end if;
      if mc is not null and (jsonb_array_length(coalesce(mc->'public_comment_replies', '[]')) <> 3 or jsonb_array_length(coalesce(mc->'dm_messages', '[]')) <> 3 or coalesce((mc->>'enabled')::boolean, false)) then problems := array_append(problems, 'ManyChat deve ter 3 respostas + 3 DMs e estar desativado'); end if;
      if v_bucket = 'calendario' then
        begin d := (it->>'scheduled_date')::date; exception when others then d := null; end;
        if d is null then problems := array_append(problems, 'sem data válida');
        elsif not ((d between date '2026-10-09' and date '2026-10-31') or (d between date '2026-11-02' and date '2026-11-30') or (d between date '2026-12-07' and date '2026-12-31')) then problems := array_append(problems, format('data fora das janelas permitidas (%s)', d)); end if;
      else d := null; end if;
      if cardinality(problems) > 0 then
        pst_i := pst_i + 1; incompat := incompat || jsonb_build_object('tipo', 'post', 'id', ext, 'titulo', it->>'title', 'motivo', array_to_string(problems, '; ')); continue;
      end if;

      st := stage; pr := case coalesce(it->>'priority', 'normal') when 'normal' then 'media' when 'baixa' then 'baixa' when 'alta' then 'alta' when 'urgente' then 'urgente' else 'media' end;
      pid := nullif(pmap->>(it->>'pillar_id'), '')::uuid;
      newid := null;
      select * into ex from public.content_posts where workspace_id = p_ws and external_id = ext;
      if found then
        if ex.import_hash = h then pst_n := pst_n + 1;
        elsif ex.manually_edited_at is not null then pst_x := pst_x + 1; conflicts := conflicts || jsonb_build_object('tipo', 'post', 'id', ext, 'titulo', it->>'title', 'motivo', 'editado manualmente depois da importação: não foi sobrescrito (decida: manter a versão do sistema ou reimportar manualmente)');
        else pst_u := pst_u + 1;
          if p_apply then
            update public.content_posts set title = it->>'title', hook = it->>'headline', concept = it->>'concept', keyword = it->>'keyword', category = it->>'category',
              caption = coalesce(it->>'caption', it->>'caption_draft'), image_prompt = coalesce(it->>'image_generation_prompt', it->>'prompt'), cover_cta = it->>'cover_cta', cta = it->>'post_end_cta',
              cards = coalesce(it->'cards', '[]'), reels = it->'reels', stories = it->'stories', manychat = mc, visual_notes = it->>'specific_direction',
              review_required = coalesce((it->>'review_required')::boolean, false), collection = it->>'editorial_collection', pillar_id = pid,
              extra = jsonb_strip_nulls(jsonb_build_object('setting', it->'setting', 'characters', it->'characters', 'source_channel', it->'source_channel', 'format_options', it->'format_options', 'group', it->'group', 'review_for_duplicates', it->'review_for_duplicates', 'reserved_from_calendar_date', it->'reserved_from_calendar_date', 'dimensions', it->'dimensions', 'origem', it->'source')),
              import_hash = h where id = ex.id;
          end if;
          newid := ex.id;
        end if;
      else
        if exists (select 1 from public.content_posts where workspace_id = p_ws and external_id is null and lower(title) = lower(it->>'title') and (v_bucket <> 'calendario' or publish_date = d)) then
          pst_x := pst_x + 1; conflicts := conflicts || jsonb_build_object('tipo', 'post', 'id', ext, 'titulo', it->>'title', 'motivo', 'já existe um post manual com o mesmo título (e data): não foi criado para evitar duplicidade');
          continue;
        end if;
        pst_c := pst_c + 1;
        if p_apply then
          insert into public.content_posts (workspace_id, external_id, source_import, import_hash, bucket, network, format, title, hook, concept, keyword, category, caption, image_prompt, cover_cta, cta,
              cards, reels, stories, manychat, visual_notes, status, priority, publish_date, pillar_id, review_required, collection, internal_notes, extra)
          values (p_ws, ext, it->>'source_import', h, v_bucket, 'instagram', 'carrossel', it->>'title', it->>'headline', it->>'concept', it->>'keyword', it->>'category',
              coalesce(it->>'caption', it->>'caption_draft'), coalesce(it->>'image_generation_prompt', it->>'prompt'), it->>'cover_cta', it->>'post_end_cta',
              coalesce(it->'cards', '[]'), it->'reels', it->'stories', mc, it->>'specific_direction', st, pr, d, pid, coalesce((it->>'review_required')::boolean, false), it->>'editorial_collection', it->>'reason',
              jsonb_strip_nulls(jsonb_build_object('setting', it->'setting', 'characters', it->'characters', 'source_channel', it->'source_channel', 'format_options', it->'format_options', 'group', it->'group', 'review_for_duplicates', it->'review_for_duplicates', 'reserved_from_calendar_date', it->'reserved_from_calendar_date', 'dimensions', it->'dimensions', 'origem', it->'source')))
          returning id into newid;
        end if;
      end if;
      -- vínculos com campanhas (só adiciona; nunca remove vínculos manuais)
      if p_apply and newid is not null then
        for cr in select jsonb_array_elements_text(coalesce(it->'campaign_ids', '[]')) loop
          cid := nullif(cmap->>cr, '')::uuid;
          if cid is not null then insert into public.content_post_campaigns (workspace_id, post_id, campaign_id) values (p_ws, newid, cid) on conflict do nothing; end if;
        end loop;
      end if;
      by_bucket := jsonb_set(by_bucket, array[v_bucket], to_jsonb(coalesce((by_bucket->>v_bucket)::int, 0) + 1));
      if d is not null then m := extract(month from d)::int; by_month := jsonb_set(by_month, array[m::text], to_jsonb(coalesce((by_month->>m::text)::int, 0) + 1), true); end if;
      by_pillar := jsonb_set(by_pillar, array[it->>'pillar_id'], to_jsonb(coalesce((by_pillar->>(it->>'pillar_id'))::int, 0) + 1), true);
    end loop;
  end loop;

  -- ===== verificações de coerência com o pacote =====
  n_sched := jsonb_array_length(coalesce(p_plan->'scheduled_posts', '[]')); n_res := jsonb_array_length(coalesce(p_plan->'reserve_nostalgia', '[]'));
  n_rem := jsonb_array_length(coalesce(p_plan->'reserve_full_posts', '[]')); n_back := jsonb_array_length(coalesce(p_plan->'backlog_ideas_not_scheduled', '[]'));
  checks := checks || jsonb_build_array(
    jsonb_build_object('ok', n_sched = coalesce((plan_cnt->>'scheduled')::int, n_sched), 'msg', format('%s posts com data (esperado %s)', n_sched, coalesce(plan_cnt->>'scheduled', '?'))),
    jsonb_build_object('ok', n_res = coalesce((plan_cnt->>'reserve_nostalgia')::int, n_res), 'msg', format('%s itens no acervo de nostalgia (esperado %s)', n_res, coalesce(plan_cnt->>'reserve_nostalgia', '?'))),
    jsonb_build_object('ok', n_rem = coalesce((plan_cnt->>'reserve_full_posts_remanejado')::int, n_rem), 'msg', format('%s posts remanejados (esperado %s)', n_rem, coalesce(plan_cnt->>'reserve_full_posts_remanejado', '?'))),
    jsonb_build_object('ok', n_back = coalesce((plan_cnt->>'backlog_ideas_optional')::int, n_back), 'msg', format('%s ideias extras (esperado %s)', n_back, coalesce(plan_cnt->>'backlog_ideas_optional', '?'))));
  if jsonb_array_length(coalesce(p_plan->'pillars', '[]')) <> 5 then warns := warns || jsonb_build_object('msg', 'O pacote não tem exatamente 5 pilares'); end if;

  return jsonb_build_object('aplicada', p_apply,
    'pilares', jsonb_build_object('criar', pil_c, 'atualizar', pil_u, 'sem_mudanca', pil_n, 'conflitos', pil_x),
    'campanhas', jsonb_build_object('criar', cam_c, 'atualizar', cam_u, 'sem_mudanca', cam_n, 'conflitos', cam_x),
    'posts', jsonb_build_object('criar', pst_c, 'atualizar', pst_u, 'sem_mudanca', pst_n, 'conflitos', pst_x, 'incompativeis', pst_i),
    'por_grupo', by_bucket, 'por_mes', by_month, 'por_pilar', by_pillar,
    'conflitos', conflicts, 'incompatibilidades', incompat, 'reutilizados', reused, 'avisos', warns, 'verificacoes', checks);
end $$;

create or replace function public.content_import_preview(p_ws uuid, p_plan jsonb, p_file text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not (app.is_ws_admin(p_ws) and app.ws_open(p_ws)) then raise exception 'sem permissão' using errcode = '42501'; end if;
  insert into public.content_import_runs (workspace_id, file_name, payload, payload_hash, report, created_by)
  values (p_ws, left(p_file, 200), p_plan, md5(p_plan::text), app.content_import(p_ws, p_plan, false), auth.uid()) returning id into rid;
  return rid;
end $$;

create or replace function public.content_import_apply(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.content_import_runs; rep jsonb;
begin
  select * into r from public.content_import_runs where id = p_run for update;
  if not found or not (app.is_ws_admin(r.workspace_id) and app.ws_open(r.workspace_id)) then raise exception 'sem permissão' using errcode = '42501'; end if;
  if r.status <> 'ensaio' or r.payload is null then raise exception 'Esta importação já foi aplicada ou descartada' using errcode = '23514'; end if;
  rep := app.content_import(r.workspace_id, r.payload, true);
  update public.content_import_runs set status = 'aplicada', applied_at = now(), report = rep, payload = null where id = r.id;
  return rep;
end $$;

create or replace function public.content_import_discard(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.content_import_runs;
begin
  select * into r from public.content_import_runs where id = p_run;
  if not found or not app.is_ws_admin(r.workspace_id) then raise exception 'sem permissão' using errcode = '42501'; end if;
  update public.content_import_runs set status = 'descartada', payload = null where id = p_run and status = 'ensaio';
end $$;

revoke execute on function public.content_import_preview(uuid, jsonb, text), public.content_import_apply(uuid), public.content_import_discard(uuid) from public, anon;
grant execute on function public.content_import_preview(uuid, jsonb, text), public.content_import_apply(uuid), public.content_import_discard(uuid) to authenticated;
revoke execute on function app.content_import(uuid, jsonb, boolean) from public, anon, authenticated;

-- ======== 20261013000009_orbiahub_brand_default.sql ========
-- OrbiaHUB — nova cor padrão da marca (lilás #7C5CFF). Só afeta estúdios novos e quem nunca trocou a cor padrão antiga (#dd00dd).
alter table public.workspaces alter column brand_color set default '#7C5CFF';
update public.workspaces set brand_color = '#7C5CFF' where lower(brand_color) = '#dd00dd';

-- ======== 20261013000010_plans_three_tiers.sql ========
-- OrbiaHUB — três planos mensais: Essencial (solo), Pro (studio) e Premium. Limites nulos = ilimitado.
update public.plans set name = 'Essencial', price_cents = 6700,  max_members = 1,    max_clients = 3,    sort = 1 where key = 'solo';
update public.plans set name = 'Pro',       price_cents = 12700, max_members = 5,    max_clients = 10,   sort = 2 where key = 'studio';
insert into public.plans (key, name, price_cents, max_members, max_clients, sort) values ('premium', 'Premium', 19700, null, null, 3)
  on conflict (key) do update set name = excluded.name, price_cents = excluded.price_cents, max_members = excluded.max_members, max_clients = excluded.max_clients, sort = excluded.sort;
-- período de teste com tudo liberado: novos estúdios entram no Premium durante o trial
alter table public.workspaces alter column plan set default 'premium';

-- ======== 20261014000011_prospecting.sql ========
-- OrbiaHUB — 0011 Prospecção (comercial): campanhas por nicho/cidade (Google Maps), prospectos, análise de presença digital e pontuação.
-- Versão essencial: sem envio automático de mensagens. Cada estúdio só vê os seus dados (workspace_id + RLS).
-- A busca no Google Maps usa a chave da PLATAFORMA (variável GOOGLE_PLACES_API_KEY no servidor); o uso é limitado por plano (buscas/mês).

alter table public.plans add column if not exists max_prospect_searches int;     -- buscas no Google Maps por mês; null = ilimitado
update public.plans set max_prospect_searches = 5  where key = 'solo'    and max_prospect_searches is null;
update public.plans set max_prospect_searches = 20 where key = 'studio'  and max_prospect_searches is null;
update public.plans set max_prospect_searches = 60 where key = 'premium' and max_prospect_searches is null;

create table public.prospect_campaigns (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  niche         text not null check (length(btrim(niche)) >= 2),
  city          text not null check (length(btrim(city)) >= 2),
  status        text not null default 'ativa' check (status in ('ativa','pausada','encerrada')),
  max_results   int not null default 20 check (max_results between 1 and 20),
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
select app.apply_rls('prospect_campaigns');
select app.audit_table('prospect_campaigns');

create table public.prospects (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  campaign_id   uuid,
  source        text not null default 'manual' check (source in ('google_maps','manual')),
  place_id      text,
  name          text not null check (length(btrim(name)) >= 2),
  category text, address text, phone text, website text, website_domain text, email text,
  rating        numeric(2,1), reviews_count int, maps_url text, google_fetched_at timestamptz,
  status        text not null default 'novo' check (status in ('novo','analisado','contatado','respondeu','descartado','convertido')),
  score         int check (score between 0 and 100),
  recommended_service text,
  analysis      jsonb, analyzed_at timestamptz, analysis_error text,
  lead_id       uuid,
  notes         text,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (campaign_id, workspace_id) references public.prospect_campaigns (id, workspace_id) on delete set null (campaign_id),
  foreign key (lead_id, workspace_id) references public.leads (id, workspace_id) on delete set null (lead_id)
);
create unique index prospects_place_uq  on public.prospects (workspace_id, place_id) where place_id is not null;
create unique index prospects_email_uq  on public.prospects (workspace_id, lower(email)) where email is not null;
create unique index prospects_domain_uq on public.prospects (workspace_id, website_domain) where website_domain is not null;
create index prospects_ws_idx on public.prospects (workspace_id, status, score desc);
create index prospects_campaign_idx on public.prospects (campaign_id);

create or replace function app.prospects_before() returns trigger language plpgsql as $$
begin
  new.email := nullif(lower(btrim(new.email)), '');
  if new.website is not null and btrim(new.website) <> '' then
    new.website := btrim(new.website);
    new.website_domain := lower(regexp_replace(regexp_replace(new.website, '^https?://', '', 'i'), '^www\.|[/?#].*$', '', 'gi'));
    if new.website_domain = '' then new.website_domain := null; end if;
  else new.website := null; new.website_domain := null; end if;
  return new;
end $$;
create trigger trg_prospects_before before insert or update on public.prospects for each row execute function app.prospects_before();
create trigger trg_prospects_touch before update on public.prospects for each row execute function app.touch_updated_at();
select app.apply_rls('prospects');
select app.audit_table('prospects');

-- Registro de cada busca no Google Maps (controla a cota mensal do plano)
create table public.prospect_searches (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  campaign_id   uuid,
  niche         text, city text,
  results       int not null default 0,
  created_by    uuid references public.profiles(id) default auth.uid(),
  created_at    timestamptz not null default now()
);
create index prospect_searches_ws_idx on public.prospect_searches (workspace_id, created_at);
select app.apply_rls('prospect_searches');

-- Retenção conservadora: dados trazidos do Google de prospectos não trabalhados são limpos após 30 dias (fica o place_id)
create or replace function app.purge_prospect_snapshots() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.prospects set address = null, phone = null, website = null, rating = null, reviews_count = null, maps_url = null
   where source = 'google_maps' and status in ('novo','descartado') and google_fetched_at < now() - interval '30 days'
     and (address is not null or phone is not null or website is not null or maps_url is not null);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function app.purge_prospect_snapshots() from public, anon, authenticated;

grant select, insert, update, delete on public.prospect_campaigns, public.prospects, public.prospect_searches to authenticated;
grant all on public.prospect_campaigns, public.prospects, public.prospect_searches to service_role;

-- o worker diário (public.run_scheduled_scans) passa a limpar também os dados antigos do Google
create or replace function public.run_scheduled_scans() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; purged int;
begin
  r := app.run_scheduled_scans();
  purged := app.purge_prospect_snapshots();
  return coalesce(r, '{}'::jsonb) || jsonb_build_object('purged_google_snapshots', purged);
end $$;
