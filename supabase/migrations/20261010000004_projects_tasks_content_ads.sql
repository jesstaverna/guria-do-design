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
