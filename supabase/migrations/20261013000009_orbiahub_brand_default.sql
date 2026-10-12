-- OrbiaHUB — nova cor padrão da marca (lilás #7C5CFF). Só afeta estúdios novos e quem nunca trocou a cor padrão antiga (#dd00dd).
alter table public.workspaces alter column brand_color set default '#7C5CFF';
update public.workspaces set brand_color = '#7C5CFF' where lower(brand_color) = '#dd00dd';
