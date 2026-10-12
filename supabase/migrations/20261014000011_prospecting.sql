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
