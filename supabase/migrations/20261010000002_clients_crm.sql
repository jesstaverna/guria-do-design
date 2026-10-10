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
