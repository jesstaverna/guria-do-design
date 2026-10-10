-- GURIA OS — 0003 Propostas comerciais (link público + aceite) e contratos (geração + aceite eletrônico)

create table public.proposals (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  number             int not null default 0,
  title              text not null check (length(btrim(title)) >= 2),
  status             text not null default 'rascunho'
                     check (status in ('rascunho','enviada','visualizada','em_negociacao','aceita','recusada','expirada')),
  lead_id            uuid,
  client_id          uuid,
  intro              text, diagnosis text, scope text, exclusions text, timeline text,
  payment_terms      text, closing text,
  valid_until        date,
  contract_months    int not null default 1 check (contract_months between 1 and 60),
  discount_cents     bigint not null default 0 check (discount_cents >= 0),
  one_time_cents     bigint not null default 0,
  monthly_cents      bigint not null default 0,
  total_cents        bigint not null default 0,
  token              text not null unique default app.new_token(),
  sent_at            timestamptz, viewed_at timestamptz,
  accepted_at        timestamptz, accepted_by_name text, accepted_by_email text, accepted_ip text,
  activated_at       timestamptz,
  project_id         uuid,
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (lead_id, workspace_id)   references public.leads (id, workspace_id)   on delete set null (lead_id),
  foreign key (client_id, workspace_id) references public.clients (id, workspace_id) on delete set null (client_id)
);
create index proposals_ws_idx on public.proposals (workspace_id, status);

create table public.proposal_items (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  proposal_id      uuid not null,
  position         int not null default 0,
  name             text not null check (length(btrim(name)) > 0),
  description      text,
  billing          text not null default 'pontual' check (billing in ('pontual','mensal')),
  quantity         numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id) on delete cascade
);
create index proposal_items_idx on public.proposal_items (proposal_id, position);

create table public.proposal_events (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  proposal_id   uuid not null,
  kind          text not null,   -- criada | enviada | visualizada | aceita | alteracao_solicitada | ativada
  detail        text, ip text, user_agent text,
  created_at    timestamptz not null default now(),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id) on delete cascade
);
create index proposal_events_idx on public.proposal_events (proposal_id, created_at);

-- número sequencial por workspace + totais recalculados no banco (única autoridade)
create or replace function app.proposals_before() returns trigger language plpgsql as $$
declare one_t bigint; mon bigint;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 7));
    select coalesce(max(number), 0) + 1 into new.number from public.proposals where workspace_id = new.workspace_id;
  else
    if old.status = 'aceita' and (new.title is distinct from old.title or new.discount_cents is distinct from old.discount_cents
       or new.contract_months is distinct from old.contract_months or new.scope is distinct from old.scope) then
      raise exception 'Proposta aceita não pode ser alterada' using errcode = '23514';
    end if;
  end if;
  select coalesce(sum(round(quantity * unit_price_cents)) filter (where billing = 'pontual'), 0),
         coalesce(sum(round(quantity * unit_price_cents)) filter (where billing = 'mensal'), 0)
    into one_t, mon from public.proposal_items where proposal_id = new.id;
  new.one_time_cents := one_t;
  new.monthly_cents := mon;
  new.total_cents := greatest(one_t + mon * new.contract_months - new.discount_cents, 0);
  new.updated_at := now();
  return new;
end $$;
create trigger trg_proposals_before before insert or update on public.proposals for each row execute function app.proposals_before();

create or replace function app.proposal_items_after() returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.proposal_id, old.proposal_id); st text;
begin
  select status into st from public.proposals where id = pid;
  if st = 'aceita' then raise exception 'Proposta aceita não pode ser alterada' using errcode = '23514'; end if;
  update public.proposals set updated_at = now() where id = pid;   -- dispara o recálculo
  return coalesce(new, old);
end $$;
create trigger trg_proposal_items_after after insert or update or delete on public.proposal_items for each row execute function app.proposal_items_after();

select app.apply_rls('proposals'); select app.apply_rls('proposal_items'); select app.apply_rls('proposal_events');
select app.audit_table('proposals');

-- Envio: gera evento e move o lead para a etapa de proposta (se houver)
create or replace function app.proposal_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'enviada' and old.status = 'rascunho' then
    new.sent_at := now();
    insert into public.proposal_events (workspace_id, proposal_id, kind) values (new.workspace_id, new.id, 'enviada');
  end if;
  return new;
end $$;
create trigger trg_proposal_status before update of status on public.proposals for each row execute function app.proposal_status_change();

-- ---------- link público: somente via RPC, token de 256 bits ----------
create or replace function public.proposal_public_open(p_token text, p_ip text default null, p_ua text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.proposals; w public.workspaces;
begin
  select * into p from public.proposals where token = p_token and status <> 'rascunho';
  if not found then return null; end if;
  select * into w from public.workspaces where id = p.workspace_id;
  if p.status = 'enviada' then
    update public.proposals set status = 'visualizada', viewed_at = now() where id = p.id;
    p.status := 'visualizada';
    insert into public.proposal_events (workspace_id, proposal_id, kind, ip, user_agent) values (p.workspace_id, p.id, 'visualizada', p_ip, left(p_ua, 300));
    perform app.notify(p.workspace_id, 'Proposta visualizada', p.title, '/propostas/' || p.id, 'info', null, null, 'viewed:' || p.id);
  end if;
  if p.status in ('visualizada','em_negociacao','enviada') and p.valid_until is not null and p.valid_until < app.today() then
    update public.proposals set status = 'expirada' where id = p.id;
    p.status := 'expirada';
  end if;
  return jsonb_build_object(
    'number', p.number, 'title', p.title, 'status', p.status, 'intro', p.intro, 'diagnosis', p.diagnosis, 'scope', p.scope,
    'exclusions', p.exclusions, 'timeline', p.timeline, 'payment_terms', p.payment_terms, 'closing', p.closing,
    'valid_until', p.valid_until, 'contract_months', p.contract_months, 'discount_cents', p.discount_cents,
    'one_time_cents', p.one_time_cents, 'monthly_cents', p.monthly_cents, 'total_cents', p.total_cents,
    'accepted_at', p.accepted_at, 'accepted_by_name', p.accepted_by_name,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'description', i.description, 'billing', i.billing,
                         'quantity', i.quantity, 'unit_price_cents', i.unit_price_cents) order by i.position, i.id)
                       from public.proposal_items i where i.proposal_id = p.id), '[]'::jsonb),
    'brand', jsonb_build_object('name', w.name, 'legal_name', w.legal_name, 'document', w.document, 'email', w.email,
                                'phone', w.phone, 'logo_url', w.logo_url, 'color', w.brand_color, 'instagram', w.instagram, 'city', w.city));
end $$;

create or replace function public.proposal_public_accept(p_token text, p_name text, p_email text, p_ip text default null, p_ua text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.proposals; l public.leads; cid uuid; won uuid;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'nome e e-mail válidos são obrigatórios' using errcode = '22023';
  end if;
  select * into p from public.proposals where token = p_token for update;
  if not found or p.status not in ('enviada','visualizada','em_negociacao') then return false; end if;
  if p.valid_until is not null and p.valid_until < app.today() then
    update public.proposals set status = 'expirada' where id = p.id; return false;
  end if;
  cid := p.client_id;
  if cid is null and p.lead_id is not null then
    select * into l from public.leads where id = p.lead_id;
    insert into public.clients (workspace_id, name, company, email, phone)
    values (p.workspace_id, coalesce(nullif(l.company, ''), l.name), l.company, coalesce(l.email, lower(p_email)), l.phone) returning id into cid;
    update public.leads set client_id = cid where id = l.id;
  elsif cid is null then
    insert into public.clients (workspace_id, name, email) values (p.workspace_id, btrim(p_name), lower(btrim(p_email))) returning id into cid;
  end if;
  select id into won from public.pipeline_stages where workspace_id = p.workspace_id and kind = 'won' order by position limit 1;
  if p.lead_id is not null and won is not null then update public.leads set stage_id = won where id = p.lead_id; end if;
  update public.proposals set status = 'aceita', accepted_at = now(), accepted_by_name = btrim(p_name),
         accepted_by_email = lower(btrim(p_email)), accepted_ip = p_ip, client_id = cid where id = p.id;
  insert into public.proposal_events (workspace_id, proposal_id, kind, detail, ip, user_agent)
  values (p.workspace_id, p.id, 'aceita', btrim(p_name) || ' <' || lower(btrim(p_email)) || '>', p_ip, left(p_ua, 300));
  perform app.notify(p.workspace_id, 'Proposta aceita 🎉', p.title || ' — gere o contrato e ative o financeiro.', '/propostas/' || p.id, 'info', null, null, 'accepted:' || p.id);
  return true;
end $$;

create or replace function public.proposal_public_request_changes(p_token text, p_name text, p_message text, p_ip text default null, p_ua text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.proposals;
begin
  if nullif(btrim(coalesce(p_message, '')), '') is null then raise exception 'mensagem obrigatória' using errcode = '22023'; end if;
  select * into p from public.proposals where token = p_token for update;
  if not found or p.status not in ('enviada','visualizada','em_negociacao') then return false; end if;
  update public.proposals set status = 'em_negociacao' where id = p.id;
  insert into public.proposal_events (workspace_id, proposal_id, kind, detail, ip, user_agent)
  values (p.workspace_id, p.id, 'alteracao_solicitada', left(coalesce(p_name, '') || ': ' || p_message, 2000), p_ip, left(p_ua, 300));
  perform app.notify(p.workspace_id, 'Cliente pediu alterações', p.title, '/propostas/' || p.id, 'warning', null, null, 'changes:' || p.id || ':' || extract(epoch from now())::bigint);
  return true;
end $$;

-- ---------- contratos ----------
create table public.contract_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null check (length(btrim(name)) >= 2),
  body          text not null,
  created_at    timestamptz not null default now()
);
select app.apply_rls('contract_templates');

create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  number          int not null default 0,
  title           text not null check (length(btrim(title)) >= 2),
  client_id       uuid,
  proposal_id     uuid,
  body            text not null,
  status          text not null default 'rascunho' check (status in ('rascunho','enviado','assinado','cancelado')),
  start_date      date, end_date date,
  value_cents     bigint not null default 0,
  token           text not null unique default app.new_token(),
  sent_at         timestamptz,
  signed_at       timestamptz, signed_name text, signed_document text, signed_ip text, signed_ua text, body_hash text,
  created_by      uuid references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (client_id, workspace_id)   references public.clients (id, workspace_id)   on delete set null (client_id),
  foreign key (proposal_id, workspace_id) references public.proposals (id, workspace_id) on delete set null (proposal_id)
);
create index contracts_ws_idx on public.contracts (workspace_id, status);

create or replace function app.contracts_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.workspace_id::text, 8));
    select coalesce(max(number), 0) + 1 into new.number from public.contracts where workspace_id = new.workspace_id;
  else
    if old.status in ('enviado','assinado') and new.body is distinct from old.body then
      raise exception 'Texto bloqueado após o envio. Cancele e gere um novo contrato.' using errcode = '23514';
    end if;
    if old.status = 'assinado' and new.status <> 'assinado' and new.status <> 'cancelado' then
      raise exception 'Contrato assinado só pode ser cancelado' using errcode = '23514';
    end if;
    if new.status = 'enviado' and old.status = 'rascunho' then new.sent_at := now(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_contracts_before before insert or update on public.contracts for each row execute function app.contracts_before();
select app.apply_rls('contracts'); select app.audit_table('contracts');

create or replace function public.contract_public_open(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', c.number, 'title', c.title, 'body', c.body, 'status', c.status, 'signed_at', c.signed_at,
         'signed_name', c.signed_name, 'body_hash', c.body_hash,
         'brand', jsonb_build_object('name', w.name, 'legal_name', w.legal_name, 'document', w.document, 'logo_url', w.logo_url, 'color', w.brand_color))
    from public.contracts c join public.workspaces w on w.id = c.workspace_id
   where c.token = p_token and c.status in ('enviado','assinado')
$$;

-- Aceite eletrônico simples (Lei 14.063/2020): nome, documento, data/hora, IP, agente e hash do texto como evidência.
create or replace function public.contract_public_sign(p_token text, p_name text, p_document text, p_ip text default null, p_ua text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null or length(regexp_replace(coalesce(p_document, ''), '\D', '', 'g')) not in (11, 14) then
    raise exception 'nome e CPF/CNPJ válidos são obrigatórios' using errcode = '22023';
  end if;
  select * into c from public.contracts where token = p_token for update;
  if not found or c.status <> 'enviado' then return false; end if;
  update public.contracts set status = 'assinado', signed_at = now(), signed_name = btrim(p_name),
         signed_document = regexp_replace(p_document, '\D', '', 'g'), signed_ip = p_ip, signed_ua = left(p_ua, 300),
         body_hash = encode(sha256(convert_to(c.body, 'UTF8')), 'hex')
   where id = c.id;
  perform app.notify(c.workspace_id, 'Contrato assinado ✍️', c.title, '/contratos/' || c.id, 'info', null, null, 'signed:' || c.id);
  return true;
end $$;
