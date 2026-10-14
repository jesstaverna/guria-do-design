-- OrbiaHUB — 0012 Ordem dos cartões nos Kanbans (arrastar como no Trello): posição dentro da coluna.
-- Reordenar NÃO conta como edição manual do conteúdo (o gatilho de conteúdo só observa campos de texto/ações).

alter table public.content_posts add column if not exists kanban_pos double precision;
alter table public.leads         add column if not exists kanban_pos double precision;

-- Renumera uma coluna inteira na ordem recebida (1000, 2000, ...). Roda como o usuário: o RLS garante que só mexe no próprio estúdio.
create or replace function public.kanban_renumber(p_kind text, p_ids uuid[]) returns int
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if coalesce(cardinality(p_ids), 0) > 500 then raise exception 'Coluna grande demais' using errcode = '22023'; end if;
  if p_kind = 'content' then
    update public.content_posts t set kanban_pos = o.n * 1000 from unnest(p_ids) with ordinality as o(id, n) where t.id = o.id;
  elsif p_kind = 'leads' then
    update public.leads t set kanban_pos = o.n * 1000 from unnest(p_ids) with ordinality as o(id, n) where t.id = o.id;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.kanban_renumber(text, uuid[]) from public, anon;
grant execute on function public.kanban_renumber(text, uuid[]) to authenticated;
