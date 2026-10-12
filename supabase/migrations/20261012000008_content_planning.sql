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
