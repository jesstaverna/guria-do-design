-- Prospecção: isolamento por estúdio, unicidade por estúdio, chaves compostas, cota por plano e limpeza de dados do Google.
-- Roda depois de rules.test.sql (usuários A/B e workspaces wsA/wsB já existem).

select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.prospect_campaigns (workspace_id, name, niche, city) values (t.get('wsA')::uuid, 'Odonto (Curitiba)', 'clínica odontológica', 'Curitiba');
select t.put('campA', (select id::text from public.prospect_campaigns where workspace_id = t.get('wsA')::uuid limit 1));
insert into public.prospects (workspace_id, campaign_id, source, place_id, name, website, email, google_fetched_at)
  values (t.get('wsA')::uuid, t.get('campA')::uuid, 'google_maps', 'pl1', 'Clínica Sorriso', 'https://www.Sorriso.com.br/contato?x=1', ' Contato@Sorriso.com.br ', now() - interval '45 days');
select t.ok((select website_domain = 'sorriso.com.br' and email = 'contato@sorriso.com.br' from public.prospects where place_id = 'pl1'), 'domínio e e-mail normalizados');
select t.raises(format($$insert into public.prospects (workspace_id, name, place_id) values (%L, 'Outra', 'pl1')$$, t.get('wsA')), '23505');                   -- mesmo local
select t.raises(format($$insert into public.prospects (workspace_id, name, website) values (%L, 'Outra', 'sorriso.com.br')$$, t.get('wsA')), '23505');      -- mesmo domínio
select t.raises(format($$insert into public.prospects (workspace_id, name, email) values (%L, 'Outra', 'CONTATO@sorriso.com.br')$$, t.get('wsA')), '23505'); -- mesmo e-mail
select t.raises(format($$insert into public.prospects (workspace_id, name, status) values (%L, 'Status ruim', 'enviado')$$, t.get('wsA')), '23514');
select t.raises(format($$insert into public.prospect_campaigns (workspace_id, name, niche, city, max_results) values (%L, 'Muitos', 'x1', 'y1', 99)$$, t.get('wsA')), '23514');
insert into public.prospect_searches (workspace_id, campaign_id, niche, city, results) values (t.get('wsA')::uuid, t.get('campA')::uuid, 'clínica odontológica', 'Curitiba', 20);
reset role;

-- assinatura expirada: somente leitura também em Prospecção
update public.workspaces set trial_ends_at = now() - interval '1 day' where id = t.get('wsB')::uuid;
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.raises(format($$insert into public.prospects (workspace_id, name) values (%L, 'Sem plano')$$, t.get('wsB')), '42501');
reset role;
update public.workspaces set trial_ends_at = now() + interval '5 days' where id = t.get('wsB')::uuid;

-- outro estúdio: não enxerga nada e pode ter o mesmo domínio/local
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok((select count(*) from public.prospects) = 0 and (select count(*) from public.prospect_campaigns) = 0 and (select count(*) from public.prospect_searches) = 0, 'outro estúdio não enxerga prospectos, campanhas nem buscas');
insert into public.prospects (workspace_id, source, place_id, name, website) values (t.get('wsB')::uuid, 'google_maps', 'pl1', 'Clínica Sorriso (B)', 'sorriso.com.br');
select t.ok((select count(*) = 1 from public.prospects), 'o mesmo local/domínio pode existir em outro estúdio');
select t.raises(format($$insert into public.prospects (workspace_id, name, campaign_id) values (%L, 'Cruzado', %L)$$, t.get('wsB'), t.get('campA')), '23503');   -- campanha de outro estúdio
select t.raises(format($$insert into public.prospects (workspace_id, name) values (%L, 'Invasor')$$, t.get('wsA')), '42501');                                       -- escrever no estúdio alheio
reset role;

-- cota por plano e chaves compostas com leads
select t.ok((select max_prospect_searches from public.plans where key = 'solo') = 5 and (select max_prospect_searches from public.plans where key = 'studio') = 20 and (select max_prospect_searches from public.plans where key = 'premium') is not null, 'cota mensal de buscas definida por plano');
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.raises(format($$update public.prospects set lead_id = %L where place_id = 'pl1' and workspace_id = %L$$, gen_random_uuid(), t.get('wsA')), '23503');
select t.raises($$select app.purge_prospect_snapshots()$$, '42501');                                                                                               -- limpeza só pelo servidor
reset role;

-- retenção: dados do Google com mais de 30 dias de prospectos não trabalhados são limpos (fica o place_id); analisados ficam
update public.prospects set status = 'analisado' where name = 'Clínica Sorriso (B)';
select t.ok((select (public.run_scheduled_scans() ? 'purged_google_snapshots') ), 'worker diário também limpa dados antigos do Google');
select t.ok((select website is null and place_id = 'pl1' from public.prospects where workspace_id = t.get('wsA')::uuid and place_id = 'pl1'), 'dados do Google (site) removidos após 30 dias; place_id mantido');
select t.ok((select website is not null from public.prospects where name = 'Clínica Sorriso (B)'), 'prospecto já trabalhado mantém os dados');
