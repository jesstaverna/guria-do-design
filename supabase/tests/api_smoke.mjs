// Smoke test das consultas PostgREST usadas pelas páginas (embeds, RPCs, upserts, filtros), contra PostgREST local
// apontando para o banco de teste. Roda DEPOIS de run_local.sh (usa os dados criados por rules.test.sql).
// Uso: PGRST_URL=http://127.0.0.1:3111 node supabase/tests/api_smoke.mjs   (ver docs/DEPLOY.md para subir o PostgREST)
import { createHmac } from 'node:crypto';
import { PostgrestClient } from '@supabase/postgrest-js';

const URL = process.env.PGRST_URL ?? 'http://127.0.0.1:3111';
const SECRET = process.env.JWT_SECRET ?? 'test-secret-test-secret-test-secret-123456';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub) => { const h = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 })}`; return `${h}.${createHmac('sha256', SECRET).update(h).digest('base64url')}`; };
const as = (sub) => new PostgrestClient(URL, sub ? { headers: { Authorization: `Bearer ${jwt(sub)}` } } : {});
const U = (c) => `00000000-0000-0000-0000-00000000000${c}`;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.error('✗', msg); } else console.log('✓', msg); };
const must = (r, msg) => { if (r.error) { fails++; console.error('✗', msg, '→', r.error.message); return null; } console.log('✓', msg); return r.data; };

const ana = as(U('a')), caio = as(U('c')), bia = as(U('b')), anon = as(null);
const WS_COLS = 'id, name, slug, plan, status, trial_ends_at, legal_name, document, email, phone, address, city, website, instagram, logo_url, brand_color, tax_rate_pct';

// sessão / workspace
const mem = must(await ana.from('workspace_members').select(`role, workspace:workspaces(${WS_COLS})`).eq('user_id', U('a')).eq('active', true), 'sessão: membership + workspace (embed)');
const ws = mem?.[0]?.workspace; ok(ws?.name?.startsWith('Estúdio'), 'sessão: workspace resolvido');
const wid = ws.id;
must(await ana.from('profiles').select('id, full_name, email').eq('id', U('a')).single(), 'sessão: perfil');

// equipe
const team = must(await ana.from('workspace_members').select('id, user_id, role, created_at, profile:profiles(full_name, email)').eq('workspace_id', wid).eq('active', true).order('created_at'), 'equipe: membros com perfil');
ok(team?.length === 2 && team[0].profile?.full_name, 'equipe: 2 membros com nome');
must(await ana.from('workspace_invites').select('id, email, role, token, expires_at').eq('workspace_id', wid).is('accepted_at', null).gt('expires_at', new Date().toISOString()), 'equipe: convites pendentes');
must(await ana.from('plans').select('name, max_members').eq('key', ws.plan).single(), 'equipe: plano');

// CRM
must(await ana.from('pipeline_stages').select('id, name, kind, probability').eq('workspace_id', wid).order('position'), 'CRM: etapas');
const leads = must(await ana.from('leads').select('id, name, company, potential_value_cents, stage_id, owner_id, last_contact_at, phone, email, created_at').eq('workspace_id', wid).order('created_at', { ascending: false }).limit(1000), 'CRM: leads');
const lead = leads?.[0];
must(await ana.from('lead_interactions').select('id, kind, content, created_at').eq('lead_id', lead.id).order('created_at', { ascending: false }), 'CRM: histórico');
must(await ana.from('proposals').select('id, number, title, status, total_cents').eq('lead_id', lead.id), 'CRM: propostas do lead');
must(await ana.from('tasks').select('id, title, due_date, status').eq('lead_id', lead.id).limit(5), 'CRM: tarefas do lead');
must(await ana.rpc('convert_lead', { p_lead: lead.id }), 'CRM: converter lead (rpc)');
must(await ana.from('clients').select('id, name, company, email, phone, segment, status, created_at').eq('workspace_id', wid).or('name.ilike.%maria%,company.ilike.%maria%').order('name'), 'clientes: busca com or()');

// propostas
const props = must(await ana.from('proposals').select('id, number, title, status, total_cents, valid_until, created_at, client:clients(name), lead:leads(name)').eq('workspace_id', wid).order('number', { ascending: false }), 'propostas: lista com embeds de cliente e lead');
ok(props?.[0]?.client?.name, 'propostas: embed do cliente resolve');
const pid = props[0].id;
must(await ana.from('proposals').select('*, client:clients(name), lead:leads(name, company)').eq('id', pid).maybeSingle(), 'propostas: prévia com embeds');
must(await ana.from('proposal_items').select('*').eq('proposal_id', pid).order('position').order('id'), 'propostas: itens');
must(await ana.from('proposal_events').select('id, kind, detail, ip, created_at').eq('proposal_id', pid).order('created_at', { ascending: false }), 'propostas: eventos');
must(await ana.from('contracts').select('id').eq('proposal_id', pid).limit(1), 'propostas: contrato vinculado');

// contratos
const cons = must(await ana.from('contracts').select('id, number, title, status, value_cents, start_date, signed_at, client:clients(name)').eq('workspace_id', wid).order('number', { ascending: false }), 'contratos: lista com cliente');
ok(cons?.[0]?.client?.name, 'contratos: embed do cliente resolve');
must(await ana.from('contracts').select('*, client:clients(id, name)').eq('id', cons[0].id).maybeSingle(), 'contratos: detalhe');
must(await ana.from('contract_templates').select('id, name, body').eq('workspace_id', wid), 'contratos: modelos');

// projetos / tarefas / agenda
must(await ana.from('projects').select('id, name, status, due_date, client:clients(name)').eq('workspace_id', wid).in('status', ['planejado', 'em_andamento', 'pausado']).order('due_date', { nullsFirst: false }), 'projetos: lista com cliente');
must(await ana.from('tasks').select('project_id, status').eq('workspace_id', wid).not('project_id', 'is', null), 'projetos: progresso');
must(await caio.from('tasks').select('id, title, description, status, priority, due_date, project_id, client_id, assignee_id').eq('workspace_id', wid).eq('assignee_id', U('c')).neq('status', 'feito').order('due_date', { nullsFirst: false }), 'tarefas: só minhas (membro)');
must(await ana.from('leads').select('id, name, next_action, next_action_at').eq('workspace_id', wid).not('next_action_at', 'is', null).gte('next_action_at', '2026-01-01T00:00:00-03:00'), 'agenda: follow-ups');

// conteúdo
const post = must(await ana.from('content_posts').insert({ workspace_id: wid, title: 'Post teste', network: 'instagram', format: 'carrossel', publish_date: '2026-10-20', status: 'roteiro' }).select('id').single(), 'conteúdo: criar post');
must(await ana.from('content_posts').select('id, title, network, format, status, publish_date, client_id').eq('workspace_id', wid).gte('publish_date', '2026-10-01').lte('publish_date', '2026-10-31').eq('network', 'instagram').is('client_id', null), 'conteúdo: calendário filtrado');
must(await ana.from('content_posts').select('id, title').eq('workspace_id', wid).or('status.neq.publicado,publish_date.gte.2026-10-10').order('publish_date', { nullsFirst: false }), 'conteúdo: quadro com or()');
must(await ana.from('content_posts').update({ status: 'publicado' }).eq('id', post.id).eq('workspace_id', wid), 'conteúdo: mudar etapa');
must(await ana.from('content_pillars').insert({ workspace_id: wid, name: 'Educação' }), 'conteúdo: pilar');

// tráfego
const camp = must(await ana.from('ad_campaigns').select('id, name, platform, status, client_id, target_cpl_cents, daily_budget_cents').eq('workspace_id', wid).order('status').order('name'), 'tráfego: campanhas')?.[0];
must(await ana.from('ad_metrics_daily').select('campaign_id, spend_cents, impressions, clicks, leads, conversions, revenue_cents').eq('workspace_id', wid).gte('day', '2026-01-01'), 'tráfego: métricas');
const up = await ana.from('ad_metrics_daily').upsert([{ workspace_id: wid, campaign_id: camp.id, day: '2026-10-09', spend_cents: 5000, leads: 2 }, { workspace_id: wid, campaign_id: camp.id, day: '2026-10-10', spend_cents: 7000, leads: 3 }], { onConflict: 'campaign_id,day' });
ok(!up.error, `tráfego: upsert por (campanha, dia)${up.error ? ' → ' + up.error.message : ''}`);
const up2 = await ana.from('ad_metrics_daily').upsert({ workspace_id: wid, campaign_id: camp.id, day: '2026-10-10', spend_cents: 9000, leads: 3 }, { onConflict: 'campaign_id,day' });
ok(!up2.error, 'tráfego: upsert repetido substitui');

// financeiro / planejamento (admin) e bloqueio ao membro
must(await ana.from('fin_transactions').select('*').eq('workspace_id', wid).gte('due_date', '2026-10-01').lte('due_date', '2026-12-31').neq('status', 'cancelado').order('due_date'), 'financeiro: lançamentos');
must(await ana.from('fin_recurring').select('*').eq('workspace_id', wid).order('active', { ascending: false }).order('description'), 'financeiro: recorrências');
must(await ana.rpc('generate_recurring_now', { p_ws: wid }), 'financeiro: gerar recorrências (rpc)');
const goals = must(await ana.rpc('goal_progress', { p_ws: wid }), 'metas: goal_progress (rpc)');
ok(goals?.length >= 1 && Number(goals[0].actual) === 200000, 'metas: realizado correto');
const cats = must(await ana.from('fin_categories').select('id, name').eq('workspace_id', wid).eq('direction', 'out').order('name'), 'orçamento: categorias');
const bu = await ana.from('budgets').upsert([{ workspace_id: wid, category_id: cats[0].id, month: '2026-10-01', planned_cents: 10000 }], { onConflict: 'category_id,month' });
ok(!bu.error, `orçamento: upsert${bu.error ? ' → ' + bu.error.message : ''}`);
const dm = must(await ana.rpc('dashboard_metrics', { p_ws: wid, p_from: '2026-10-01', p_to: '2026-10-31' }), 'painel: dashboard_metrics (admin)');
ok(dm && 'received_cents' in dm && Number(dm.ads_spend_cents) >= 0, 'painel: admin recebe bloco financeiro');
const dmc = must(await caio.rpc('dashboard_metrics', { p_ws: wid, p_from: '2026-10-01', p_to: '2026-10-31' }), 'painel: dashboard_metrics (membro)');
ok(dmc && !('received_cents' in dmc), 'painel: membro NÃO recebe financeiro');
ok((await caio.from('fin_transactions').select('id').eq('workspace_id', wid)).data?.length === 0, 'RLS: membro não lê financeiro');
ok((await caio.rpc('goal_progress', { p_ws: wid })).error?.code === '42501', 'RLS: membro não chama goal_progress');
ok((await bia.from('clients').select('id').eq('workspace_id', wid)).data?.length === 0, 'RLS: outro tenant não lê clientes');
ok((await bia.rpc('dashboard_metrics', { p_ws: wid, p_from: '2026-10-01', p_to: '2026-10-31' })).error?.code === '42501', 'RLS: outro tenant não chama métricas');

// notificações
must(await ana.from('notifications').select('id, severity, title, body, link, read_at, created_at').eq('workspace_id', wid).order('created_at', { ascending: false }).limit(100), 'alertas: lista');
const nn = await ana.from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', wid).is('read_at', null);
ok(!nn.error && nn.count >= 1, 'alertas: contagem de não lidos');
ok(!(await ana.from('notifications').update({ read_at: new Date().toISOString() }).eq('workspace_id', wid).is('read_at', null)).error, 'alertas: marcar todos como lidos');

// links públicos (anon): só RPC
ok((await anon.from('proposals').select('id')).error?.code === '42501', 'anon: sem acesso a tabelas');
const tok = (await ana.from('proposals').select('token').eq('id', pid).single()).data.token;
const open = must(await anon.rpc('proposal_public_open', { p_token: tok, p_ip: '1.1.1.1', p_ua: 'x' }), 'público: proposal_public_open');
ok(open?.status === 'aceita' && open.brand?.name && !JSON.stringify(open).includes(tok), 'público: payload completo sem vazar token');
const ctok = (await ana.from('contracts').select('token').eq('id', cons[0].id).single()).data.token;
ok((await anon.rpc('contract_public_open', { p_token: ctok })).data?.status === 'assinado', 'público: contract_public_open');
ok((await anon.rpc('run_scheduled_scans')).error != null, 'anon NÃO executa varredura');
ok((await ana.rpc('run_scheduled_scans')).error != null, 'usuário NÃO executa varredura');

// onboarding
const nu = as(U('d'));
const created = must(await nu.rpc('create_workspace', { p_name: 'Dani Studio' }), 'onboarding: create_workspace (rpc)');
ok(typeof created === 'string', 'onboarding: retorna id');

if (fails) { console.error(`\n${fails} verificação(ões) falharam`); process.exit(1); }
console.log('\nOK — todas as consultas das páginas funcionam via PostgREST');
