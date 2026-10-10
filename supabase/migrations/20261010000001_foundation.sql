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
