-- OrbiaHUB: atualização do banco de PRODUÇÃO (seguro rodar mais de uma vez). Cole tudo no SQL Editor e clique em Run.
-- Aplica 0006 (avatar/logo), 0007 (anexos de tarefas), a permissão de anexos de conteúdo (parte da 0008), 0009 (cor) e 0010 (planos).

-- ======== 20261011000006_branding_storage ========
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

-- ======== 20261011000007_task_attachments ========
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

-- ======== permissão de anexos (tarefas + conteúdo) ========
create or replace function app.can_access_attachment(obj_name text, p_write boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare parts text[] := string_to_array(obj_name, '/');
begin
  if array_length(parts, 1) < 5 or parts[1] <> 'ws' or parts[3] not in ('tasks', 'content') then return false; end if;
  if parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return case when p_write then app.can_write(parts[2]::uuid) else app.is_member(parts[2]::uuid) end;
end $$;

-- ======== 20261013000009_orbiahub_brand_default ========
-- OrbiaHUB — nova cor padrão da marca (lilás #7C5CFF). Só afeta estúdios novos e quem nunca trocou a cor padrão antiga (#dd00dd).
alter table public.workspaces alter column brand_color set default '#7C5CFF';
update public.workspaces set brand_color = '#7C5CFF' where lower(brand_color) = '#dd00dd';

-- ======== 20261013000010_plans_three_tiers ========
-- OrbiaHUB — três planos mensais: Essencial (solo), Pro (studio) e Premium. Limites nulos = ilimitado.
update public.plans set name = 'Essencial', price_cents = 6700,  max_members = 1,    max_clients = 3,    sort = 1 where key = 'solo';
update public.plans set name = 'Pro',       price_cents = 12700, max_members = 5,    max_clients = 10,   sort = 2 where key = 'studio';
insert into public.plans (key, name, price_cents, max_members, max_clients, sort) values ('premium', 'Premium', 19700, null, null, 3)
  on conflict (key) do update set name = excluded.name, price_cents = excluded.price_cents, max_members = excluded.max_members, max_clients = excluded.max_clients, sort = excluded.sort;
-- período de teste com tudo liberado: novos estúdios entram no Premium durante o trial
alter table public.workspaces alter column plan set default 'premium';
