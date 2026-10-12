-- Planejamento de conteúdo: pilares, calendário/Kanban (regras no banco) e importação controlada (ensaio, idempotência, conflitos).
-- Roda depois de rules.test.sql (reaproveita usuários A/B/C e os workspaces wsA/wsB). Plano sintético: sem dados reais.

create function t.cards(n int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('position', g, 'role', case g when 1 then 'capa' when 7 then 'fechamento' else 'desenvolvimento' end,
         'headline', 'Card ' || g, 'body', 'Corpo ' || g, 'cta', case when g in (1, 7) then 'CTA ' || g end, 'visual_direction', 'Visual')), '[]') from generate_series(1, n) g $$;
create function t.mc(en boolean default false, replies int default 3) returns jsonb language sql as $$
  select jsonb_build_object('name', 'GDD | X', 'channel', 'Instagram', 'trigger_type', 'comment_keyword', 'trigger_keyword', 'X', 'status', 'rascunho', 'enabled', en,
    'public_comment_replies', (select jsonb_agg('r' || g) from generate_series(1, replies) g), 'dm_messages', jsonb_build_array('d1', 'd2', 'd3')) $$;
create function t.post(id text, title text, pillar text, d text default null, stage text default 'roteiro', cards int default 7, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('id', id, 'title', title, 'headline', 'H ' || title, 'concept', 'C', 'keyword', upper(id), 'category', 'Dica', 'caption', 'Legenda de ' || title || E'\nacentuação 💜',
    'prompt', 'prompt ' || title, 'image_generation_prompt', 'prompt ' || title, 'cover_cta', 'Arraste →', 'post_end_cta', 'Comente X', 'cards', t.cards(cards), 'manychat', t.mc(),
    'pillar_id', pillar, 'campaign_ids', jsonb_build_array('camp1'), 'kanban_stage', stage, 'priority', 'normal', 'published', false, 'source_import', 'teste-v1', 'review_required', true,
    'editorial_collection', 'Coleção', 'scheduled_date', d) || extra $$;
create function t.plan() returns jsonb language sql as $$
  select jsonb_build_object('schema_version', '2.0.0',
    'counts', jsonb_build_object('scheduled', 3, 'reserve_nostalgia', 2, 'reserve_full_posts_remanejado', 1, 'backlog_ideas_optional', 2),
    'pillars', jsonb_build_array(
      jsonb_build_object('id', 'p1', 'name', 'IA na prática', 'description', 'd', 'objective', 'o', 'color', '#468ADE', 'order', 1),
      jsonb_build_object('id', 'p2', 'name', 'Problemas reais', 'description', 'd', 'objective', 'o', 'color', '#E4A05A', 'order', 2),
      jsonb_build_object('id', 'p3', 'name', 'Nostalgia', 'description', 'd', 'objective', 'o', 'color', '#B6A2F6', 'order', 3),
      jsonb_build_object('id', 'p4', 'name', 'Prospecção', 'description', 'd', 'objective', 'o', 'color', '#B00BB5', 'order', 4),
      jsonb_build_object('id', 'p5', 'name', 'Autoridade', 'description', 'd', 'objective', 'o', 'color', '#9874B7', 'order', 5)),
    'editorial_campaigns', jsonb_build_array(jsonb_build_object('id', 'camp1', 'name', 'Campanha 1', 'period', '2026-11', 'type', 'serie', 'status', 'rascunho', 'notes', 'n')),
    'scheduled_posts', jsonb_build_array(t.post('S1', 'Post um', 'p1', '2026-10-09'), t.post('S2', 'Post dois', 'p2', '2026-11-02'), t.post('S3', 'Post três', 'p3', '2026-12-07')),
    'reserve_nostalgia', jsonb_build_array(t.post('R1', 'Reserva um', 'p3', null, 'ideia', 7, '{"reels":{"duration_seconds":16,"beats":[]},"stories":{"frames":[]}}'), t.post('R2', 'Reserva dois', 'p3', null, 'ideia')),
    'reserve_full_posts', jsonb_build_array(t.post('X1', 'Remanejado', 'p4', null, 'roteiro', 7, '{"reason":"Remanejado","reserved_from_calendar_date":"2026-10-13"}')),
    'backlog_ideas_not_scheduled', jsonb_build_array(
      jsonb_build_object('id', 'B1', 'title', 'Ideia um', 'headline', 'h', 'group', 'g', 'pillar_id', 'p1', 'kanban_stage', 'ideia', 'review_for_duplicates', true, 'source_import', 'teste-v1'),
      jsonb_build_object('id', 'B2', 'title', 'Ideia dois', 'headline', 'h', 'group', 'g', 'pillar_id', 'p1', 'kanban_stage', 'ideia', 'review_for_duplicates', true, 'source_import', 'teste-v1'))) $$;
grant execute on all functions in schema t to anon, authenticated;

-- ===== ensaio não grava =====
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.put('np0', (select count(*)::text from public.content_posts where workspace_id = t.get('wsA')::uuid));
select t.put('run1', public.content_import_preview(t.get('wsA')::uuid, t.plan(), 'plano.json')::text);
select t.ok((select count(*) from public.content_posts where workspace_id = t.get('wsA')::uuid)::text = t.get('np0'), 'ensaio (dry-run) não grava posts');
select t.ok((select count(*) from public.content_pillars where external_id is not null and workspace_id = t.get('wsA')::uuid) = 0, 'ensaio não cria pilares');
select t.ok((select (report->'posts'->>'criar')::int = 8 and (report->'pilares'->>'criar')::int = 5 and (report->'campanhas'->>'criar')::int = 1 and jsonb_array_length(report->'incompatibilidades') = 0 from public.content_import_runs where id = t.get('run1')::uuid), 'ensaio: 8 posts, 5 pilares e 1 campanha a criar, sem incompatibilidades');
select t.ok((select bool_and((c->>'ok')::boolean) from public.content_import_runs r, jsonb_array_elements(r.report->'verificacoes') c where r.id = t.get('run1')::uuid), 'verificações de contagem do pacote passam');

-- ===== aplicar =====
select public.content_import_apply(t.get('run1')::uuid);
select t.ok((select count(*) from public.content_posts where workspace_id = t.get('wsA')::uuid and external_id is not null) = 8, '8 posts importados');
select t.ok((select count(*) = 3 from public.content_posts where external_id like 'S%' and bucket = 'calendario' and publish_date is not null), '3 posts com data no calendário');
select t.ok((select count(*) = 2 from public.content_posts where external_id like 'R%' and bucket = 'acervo' and publish_date is null), 'acervo sem data');
select t.ok((select count(*) = 1 from public.content_posts where external_id = 'X1' and bucket = 'remanejado' and publish_date is null and internal_notes = 'Remanejado'), 'remanejado preservado sem data');
select t.ok((select count(*) = 2 from public.content_posts where external_id like 'B%' and bucket = 'ideia' and status = 'ideia'), 'ideias extras no backlog');
select t.ok((select bool_and(status = 'roteiro' and jsonb_array_length(cards) = 7 and (manychat->>'enabled')::boolean = false and manychat->>'status' = 'rascunho' and published_at is null and platform_scheduled_at is null) from public.content_posts where external_id in ('S1','S2','S3','X1')), 'posts entram em Roteiro, 7 cards, ManyChat rascunho/desativado, nada publicado/agendado');
select t.ok((select caption like '%acentuação 💜%' from public.content_posts where external_id = 'S1'), 'UTF-8, acentos e emoji preservados');
select t.ok((select count(*) = 5 from public.content_pillars where workspace_id = t.get('wsA')::uuid and external_id is not null), '5 pilares');
select t.ok((select count(*) = 6 from public.content_post_campaigns), 'vínculos com a campanha criados como tag (não pilar)');
select t.ok((select payload is null and status = 'aplicada' from public.content_import_runs where id = t.get('run1')::uuid), 'payload descartado após aplicar');

-- ===== idempotência =====
select t.put('run2', public.content_import_preview(t.get('wsA')::uuid, t.plan(), 'plano.json')::text);
select t.ok((select (report->'posts'->>'criar')::int = 0 and (report->'posts'->>'sem_mudanca')::int = 8 and (report->'pilares'->>'sem_mudanca')::int = 5 from public.content_import_runs where id = t.get('run2')::uuid), 'segundo ensaio: nada a criar, 8 sem mudança');
select public.content_import_apply(t.get('run2')::uuid);
select t.ok((select count(*) from public.content_posts where workspace_id = t.get('wsA')::uuid and external_id is not null) = 8, 'rodar duas vezes NÃO duplica');
select t.raises(format($$select public.content_import_apply(%L)$$, t.get('run2')), '23514');   -- não reaplica a mesma execução

-- ===== edição manual protegida; fluxo de trabalho não bloqueia =====
update public.content_posts set caption = 'Minha versão' where external_id = 'S1';
select t.ok((select manually_edited_at is not null from public.content_posts where external_id = 'S1'), 'edição de conteúdo marca manually_edited_at');
update public.content_posts set publish_date = '2026-10-10' where external_id = 'S2';
select t.ok((select manually_edited_at is null from public.content_posts where external_id = 'S2'), 'reagendar não conta como edição de conteúdo');
select t.put('plan2', (select jsonb_set(jsonb_set(t.plan(), '{scheduled_posts,0,caption}', '"Origem mudou 1"'), '{scheduled_posts,1,caption}', '"Origem mudou 2"'))::text);
select t.put('run3', public.content_import_preview(t.get('wsA')::uuid, t.get('plan2')::jsonb, 'plano2.json')::text);
select t.ok((select (report->'posts'->>'conflitos')::int = 1 and (report->'posts'->>'atualizar')::int = 1 from public.content_import_runs where id = t.get('run3')::uuid), 'ensaio: 1 conflito (editado) e 1 atualização (intacto)');
select public.content_import_apply(t.get('run3')::uuid);
select t.ok((select caption = 'Minha versão' from public.content_posts where external_id = 'S1'), 'edição manual NÃO foi sobrescrita');
select t.ok((select caption = 'Origem mudou 2' and publish_date = '2026-10-10' from public.content_posts where external_id = 'S2'), 'atualização aplicada preservando a nova data editorial');

-- ===== incompatibilidades, duplicatas e reuso =====
insert into public.content_pillars (workspace_id, name) values (t.get('wsA')::uuid, 'Bastidores');
insert into public.content_posts (workspace_id, title, network, format, status, bucket) values (t.get('wsA')::uuid, 'Ideia nova', 'instagram', 'carrossel', 'ideia', 'ideia');
select t.put('plan3', (jsonb_set(jsonb_set(jsonb_set(t.plan(), '{pillars}', (t.plan()->'pillars') || jsonb_build_array(jsonb_build_object('id', 'p6', 'name', 'Bastidores', 'description', 'd', 'objective', 'o', 'color', '#111111', 'order', 6))), '{backlog_ideas_not_scheduled}', (t.plan()->'backlog_ideas_not_scheduled') || jsonb_build_array(jsonb_build_object('id', 'B3', 'title', 'Ideia nova', 'headline', 'h', 'pillar_id', 'p1', 'kanban_stage', 'ideia'))), '{scheduled_posts}', (t.plan()->'scheduled_posts') ||
   jsonb_build_array(t.post('E1', 'Cards errados', 'p1', '2026-10-15', 'roteiro', 6), t.post('E2', 'Data fora', 'p1', '2026-10-05'), t.post('E3', 'Pilar ruim', 'pxx', '2026-10-16'),
                     t.post('E4', 'Já publicado', 'p1', '2026-10-17', 'publicado'), t.post('E5', 'ManyChat ligado', 'p1', '2026-10-18', 'roteiro', 7, jsonb_build_object('manychat', t.mc(true))),
                     t.post('E6', 'Fora de sábado de novembro', 'p1', '2026-11-01'))))::text);
select t.put('run4', public.content_import_preview(t.get('wsA')::uuid, t.get('plan3')::jsonb, 'plano3.json')::text);
select t.ok((select (report->'posts'->>'incompativeis')::int = 6 from public.content_import_runs where id = t.get('run4')::uuid), 'ensaio: 6 itens incompatíveis (7 cards, janela de datas, pilar, publicado, ManyChat ativo)');
select t.ok((select exists (select 1 from jsonb_array_elements(report->'conflitos') c where c->>'titulo' = 'Ideia nova' and c->>'motivo' like '%mesmo título%') from public.content_import_runs where id = t.get('run4')::uuid), 'post manual com o mesmo título é reportado como possível duplicata');
select t.ok((select exists (select 1 from jsonb_array_elements(report->'reutilizados') c where c->>'titulo' = 'Bastidores') from public.content_import_runs where id = t.get('run4')::uuid), 'pilar manual com o mesmo nome é reutilizado');
select public.content_import_discard(t.get('run4')::uuid);
select t.ok((select status = 'descartada' and payload is null from public.content_import_runs where id = t.get('run4')::uuid), 'execução descartada não guarda payload');

-- ===== regras de publicação, 7 cards, ManyChat, acervo =====
select t.raises($$update public.content_posts set status = 'publicado' where external_id = 'S3'$$, '23514');   -- sem data real de publicação
update public.content_posts set status = 'publicado', published_at = '2026-12-07 12:00-03' where external_id = 'S3';
select t.ok((select published_confirmed_by = '00000000-0000-0000-0000-00000000000a' and published_confirmed_at is not null from public.content_posts where external_id = 'S3'), 'publicado registra data real e quem confirmou');
update public.content_posts set status = 'roteiro' where external_id = 'S3';
select t.ok((select published_at is null and published_confirmed_at is null from public.content_posts where external_id = 'S3'), 'voltar de publicado limpa a confirmação');
select t.raises($$update public.content_posts set cards = (select jsonb_agg(c) from jsonb_array_elements(cards) c where c->>'position' <> '7') where external_id = 'S3'$$, '23514');
select t.raises($$update public.content_posts set manychat = jsonb_set(manychat, '{enabled}', 'true') where external_id = 'S3'$$, '23514');
update public.content_posts set publish_date = '2026-12-20' where external_id = 'R2';
select t.ok((select bucket = 'calendario' from public.content_posts where external_id = 'R2'), 'dar data a item do acervo (ação explícita) leva ao calendário');
select t.ok((select count(*) >= 5 from public.content_post_events where kind in ('importado', 'status', 'reagendado', 'publicado', 'editado')), 'histórico registra importação, status, reagendamento, publicação e edição');
insert into public.content_attachments (workspace_id, post_id, kind, provider, name, url) select workspace_id, id, 'link', 'google_drive', 'Referência', 'https://drive.google.com/x' from public.content_posts where external_id = 'S1';
select t.raises(format($$insert into public.content_attachments (workspace_id, post_id, kind, name, path) select workspace_id, id, 'arquivo', 'x', 'ws/%s/content/outro/x.pdf' from public.content_posts where external_id = 'S1'$$, t.get('wsA')), '23514');
reset role;

-- ===== permissões e isolamento =====
select t.login('00000000-0000-0000-0000-00000000000c'); set role authenticated;   -- membro (não admin)
select t.raises(format($$select public.content_import_preview(%L, '{"pillars":[],"scheduled_posts":[]}'::jsonb)$$, t.get('wsA')), '42501');
select t.ok((select count(*) from public.content_posts where external_id is not null) >= 8, 'membro enxerga o planejamento');
select t.ok((select count(*) from public.content_import_runs) = 0, 'membro não vê execuções de importação');
reset role;
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;   -- outro tenant
select t.ok((select count(*) from public.content_posts where external_id is not null) = 0, 'outro tenant não enxerga posts importados');
select t.raises(format($$select public.content_import_apply(%L)$$, t.get('run1')), '42501');
reset role;
