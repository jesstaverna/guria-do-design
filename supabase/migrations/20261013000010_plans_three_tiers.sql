-- OrbiaHUB — três planos mensais: Essencial (solo), Pro (studio) e Premium. Limites nulos = ilimitado.
update public.plans set name = 'Essencial', price_cents = 6700,  max_members = 1,    max_clients = 3,    sort = 1 where key = 'solo';
update public.plans set name = 'Pro',       price_cents = 12700, max_members = 5,    max_clients = 10,   sort = 2 where key = 'studio';
insert into public.plans (key, name, price_cents, max_members, max_clients, sort) values ('premium', 'Premium', 19700, null, null, 3)
  on conflict (key) do update set name = excluded.name, price_cents = excluded.price_cents, max_members = excluded.max_members, max_clients = excluded.max_clients, sort = excluded.sort;
-- período de teste com tudo liberado: novos estúdios entram no Premium durante o trial
alter table public.workspaces alter column plan set default 'premium';
