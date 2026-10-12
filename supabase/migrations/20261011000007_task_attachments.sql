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
