-- Onboarding: modelos, tarefas encadeadas, cronograma que se ajusta, Espaço do Cliente (público) e rotinas automáticas.
-- Roda depois de rules.test.sql (usuários A/B/C e workspaces wsA/wsB).

-- modelos padrão criados para cada estúdio
select t.ok((select count(*) = 4 from public.onboarding_templates where workspace_id = t.get('wsA')::uuid), 'estúdio A recebeu os 4 modelos padrão');
select t.ok((select count(*) = 4 from public.onboarding_templates where workspace_id = t.get('wsB')::uuid), 'estúdio B também');
select t.ok((select count(*) >= 20 from public.onboarding_steps where workspace_id = t.get('wsA')::uuid), 'modelos vêm com etapas');

select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.put('tpl', (select id::text from public.onboarding_templates where workspace_id = t.get('wsA')::uuid and name = 'Identidade visual'));
select t.put('proj', (select id::text from public.projects where workspace_id = t.get('wsA')::uuid limit 1));
select t.ok(public.start_onboarding(t.get('proj')::uuid, t.get('tpl')::uuid, date '2026-11-02') = 8, 'start_onboarding cria 8 tarefas');
select t.ok((select min(due_date) = date '2026-11-05' and max(due_date) = date '2026-12-05' from public.tasks where project_id = t.get('proj')::uuid and chain_pos is not null), 'datas encadeadas a partir do início (somando a duração de cada etapa)');
select t.ok((select count(*) = 3 from public.tasks where project_id = t.get('proj')::uuid and owner_side = 'cliente'), 'etapas do cliente marcadas');
select t.ok((select due_date = date '2026-12-05' and template_id is not null from public.projects where id = t.get('proj')::uuid), 'projeto recebe modelo e prazo final');
select t.raises(format($$select public.start_onboarding(%L, %L, current_date)$$, t.get('proj'), t.get('tpl')), '23514');   -- já tem onboarding

-- cronograma que se ajusta: adia a etapa 2 em 3 dias → etapas 3..8 acompanham; etapa 1 e concluídas não
update public.tasks set status = 'feito' where project_id = t.get('proj')::uuid and chain_pos = 3;
select t.put('t2', (select id::text from public.tasks where project_id = t.get('proj')::uuid and chain_pos = 2));
select t.put('t2due', (select due_date::text from public.tasks where id = t.get('t2')::uuid));
select t.put('t4due', (select due_date::text from public.tasks where project_id = t.get('proj')::uuid and chain_pos = 4));
select t.put('t3due', (select due_date::text from public.tasks where project_id = t.get('proj')::uuid and chain_pos = 3));
select t.ok(public.shift_chain(t.get('t2')::uuid, (t.get('t2due')::date + 3)) = 5, 'shift_chain ajusta as 5 etapas seguintes ainda abertas');
select t.ok((select due_date = t.get('t4due')::date + 3 from public.tasks where project_id = t.get('proj')::uuid and chain_pos = 4), 'etapa seguinte andou 3 dias');
select t.ok((select due_date = t.get('t3due')::date from public.tasks where project_id = t.get('proj')::uuid and chain_pos = 3), 'etapa já concluída não muda');
select t.ok((select due_date = date '2026-12-08' from public.projects where id = t.get('proj')::uuid), 'prazo final do projeto acompanha');
select t.ok(public.shift_chain(t.get('t2')::uuid, (t.get('t2due')::date + 3)) = 0, 'repetir a mesma data não desloca de novo');
select t.ok((select count(*) = 1 from public.notifications where workspace_id = t.get('wsA')::uuid and title = 'Cronograma recalculado'), 'aviso de cronograma recalculado');
reset role;

-- Espaço do Cliente (público)
select t.put('ptoken', (select portal_token from public.projects where id = t.get('proj')::uuid));
set role anon;
select t.ok(public.portal_open('token-invalido-token-invalido') is null, 'token inválido não abre');
select t.ok((public.portal_open(t.get('ptoken'))->'project'->>'name') is not null and jsonb_array_length(public.portal_open(t.get('ptoken'))->'steps') = 8, 'portal mostra as 8 etapas visíveis');
select t.ok(public.portal_open(t.get('ptoken'))::text not like '%workspace_id%' and public.portal_open(t.get('ptoken'))::text not like '%created_by%', 'portal não vaza ids internos');
select t.raises($$select * from public.tasks$$, '42501');     -- anon continua sem acesso direto às tabelas
reset role;
select t.put('ctask', (select id::text from public.tasks where project_id = t.get('proj')::uuid and owner_side = 'cliente' order by chain_pos limit 1));
select t.put('stask', (select id::text from public.tasks where project_id = t.get('proj')::uuid and owner_side = 'estudio' order by chain_pos limit 1));
set role anon;
select t.ok(not public.portal_respond(t.get('ptoken'), t.get('stask')::uuid, 'tentando mexer em etapa do estúdio'), 'cliente não responde etapa do estúdio');
select t.raises(format($$select public.portal_respond(%L, %L, ' ')$$, t.get('ptoken'), t.get('ctask')), '22023');
select t.ok(public.portal_respond(t.get('ptoken'), t.get('ctask')::uuid, 'https://drive.google.com/briefing'), 'cliente responde a própria etapa');
select t.ok(not public.portal_respond('outro-token-outro-token-outro', t.get('ctask')::uuid, 'token de outro projeto'), 'token errado não responde');
reset role;
select t.ok((select status = 'revisao' and client_response like 'https://%' and client_done_at is not null from public.tasks where id = t.get('ctask')::uuid), 'resposta salva e etapa vai para revisão');
select t.ok((select count(*) = 1 from public.notifications where workspace_id = t.get('wsA')::uuid and title = 'Cliente respondeu'), 'estúdio é avisado');
update public.tasks set status = 'feito' where id = t.get('ctask')::uuid;
set role anon;
select t.ok(not public.portal_respond(t.get('ptoken'), t.get('ctask')::uuid, 'depois de concluída'), 'etapa concluída não aceita nova resposta');
reset role;
update public.projects set portal_enabled = false where id = t.get('proj')::uuid;
set role anon;
select t.ok(public.portal_open(t.get('ptoken')) is null, 'portal desligado não abre');
reset role;
update public.projects set portal_enabled = true where id = t.get('proj')::uuid;

-- isolamento
select t.login('00000000-0000-0000-0000-00000000000b'); set role authenticated;
select t.ok((select count(*) from public.onboarding_templates where workspace_id = t.get('wsA')::uuid) = 0, 'outro estúdio não vê modelos alheios');
select t.raises(format($$select public.start_onboarding(%L, %L, current_date)$$, t.get('proj'), t.get('tpl')), '42501');
select t.raises(format($$select public.shift_chain(%L, current_date)$$, t.get('t2')), '42501');
reset role;

-- ativar proposta já com onboarding
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
insert into public.proposals (workspace_id, title) values (t.get('wsA')::uuid, 'Social media Padaria');
reset role;
update public.proposals set status = 'aceita', accepted_at = now() where title = 'Social media Padaria';
select t.login('00000000-0000-0000-0000-00000000000a'); set role authenticated;
select t.put('tpl2', (select id::text from public.onboarding_templates where workspace_id = t.get('wsA')::uuid and name = 'Social media'));
select public.activate_proposal((select id from public.proposals where title = 'Social media Padaria'), 1, date '2026-11-10', true, t.get('tpl2')::uuid);
select t.ok((select count(*) = 7 from public.tasks tk join public.projects pr on pr.id = tk.project_id where pr.name = 'Social media Padaria' and tk.chain_pos is not null), 'ativação com modelo cria o projeto e as 7 tarefas');
select t.ok((select count(*) = 1 from public.proposal_events where kind = 'ativada' and detail like '%onboarding%'), 'histórico registra o onboarding');
reset role;

-- rotinas automáticas: lembrete de pendência do cliente e resumo do dia
update public.tasks set created_at = now() - interval '5 days' where project_id = t.get('proj')::uuid and owner_side = 'cliente' and status = 'a_fazer';
update public.projects set status = 'em_andamento' where id = t.get('proj')::uuid;
select t.ok((select (public.run_scheduled_scans() ? 'client_reminders') and (public.run_scheduled_scans() ? 'daily_digests')), 'worker devolve contadores das rotinas');
select t.ok((select count(*) >= 1 from public.notifications where workspace_id = t.get('wsA')::uuid and title = 'Cliente ainda não respondeu'), 'lembrete de pendência do cliente');
select t.ok((select count(*) = 1 from public.notifications where workspace_id = t.get('wsA')::uuid and title = 'Resumo do dia'), 'resumo do dia criado (uma vez por dia)');
