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
