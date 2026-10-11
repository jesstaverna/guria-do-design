// Gera n8n/workflow-instagram.json  (node n8n/build.mjs)
import { writeFileSync } from "node:fs";

const code = String.raw`// ====== EDITE AQUI ======
const CONFIG = {
  igUserId: 'SEU_IG_USER_ID',
  token: 'SEU_IG_ACCESS_TOKEN',
  graph: 'v23.0',
  rules: [
    {
      id: 'ebook',
      palavras: ['quero', 'eu quero', 'prompts'],
      respostasPublicas: ['Te enviei no direct! 💌', 'Mandei no seu direct, confere lá! ✨', 'Prontinho, olha seu direct! 💜'],
      dmTexto: 'Oi! Vi seu comentário 💜 Quer receber o material gratuito agora?',
      dmBotao: 'Quero receber',
      conteudo: 'Aqui está o seu material gratuito 🎁\nhttps://guriadodesign.com.br/material',
      posts: [] // vazio = qualquer post; ou ['ID_DA_MIDIA']
    }
  ]
};
// =========================

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const state = $getWorkflowStaticData('global');
state.comments = state.comments || [];
state.deliveries = state.deliveries || [];
state.leads = state.leads || [];

const base = 'https://graph.instagram.com/' + CONFIG.graph;
const body = $input.first().json.body || {};
const out = [];

for (const entry of body.entry || []) {
  for (const ch of entry.changes || []) {
    if (ch.field !== 'comments') continue;
    const c = ch.value || {};
    if (!c.id || !c.text || !c.from || c.from.id === CONFIG.igUserId) continue;
    const text = ' ' + norm(c.text) + ' ';
    const mediaId = c.media && c.media.id;
    const rule = CONFIG.rules.find((r) =>
      (!r.posts.length || (mediaId && r.posts.includes(mediaId))) &&
      r.palavras.some((p) => text.includes(' ' + norm(p) + ' ')));
    if (!rule || state.comments.includes(c.id)) continue;
    state.comments.push(c.id);
    state.comments = state.comments.slice(-2000);
    state.leads.push({ user: c.from.id, username: c.from.username, rule: rule.id, text: c.text, at: new Date().toISOString() });
    state.leads = state.leads.slice(-5000);
    const resp = rule.respostasPublicas[Math.floor(Math.random() * rule.respostasPublicas.length)];
    out.push({ json: {
      type: 'comment',
      token: CONFIG.token,
      privateReplyUrl: base + '/' + CONFIG.igUserId + '/messages',
      privateReplyBody: {
        recipient: { comment_id: c.id },
        message: { attachment: { type: 'template', payload: {
          template_type: 'button', text: rule.dmTexto,
          buttons: [{ type: 'postback', title: rule.dmBotao.slice(0, 20), payload: 'receber:' + rule.id }]
        } } }
      },
      commentReplyUrl: base + '/' + c.id + '/replies',
      commentReplyBody: { message: resp }
    } });
  }
  for (const ev of entry.messaging || []) {
    const userId = ev.sender && ev.sender.id;
    const payload = ev.postback && ev.postback.payload;
    if (!userId || userId === CONFIG.igUserId || (ev.message && ev.message.is_echo)) continue;
    if (!payload || !payload.startsWith('receber:')) continue;
    const rule = CONFIG.rules.find((r) => r.id === payload.slice(8));
    const key = userId + ':' + (rule && rule.id);
    if (!rule || state.deliveries.includes(key)) continue;
    state.deliveries.push(key);
    state.deliveries = state.deliveries.slice(-5000);
    out.push({ json: {
      type: 'postback',
      token: CONFIG.token,
      sendUrl: base + '/' + CONFIG.igUserId + '/messages',
      sendBody: { recipient: { id: userId }, message: { text: rule.conteudo } }
    } });
  }
}
return out;`;

const http = (name, position, urlExpr, bodyExpr, extra = {}) => ({
  id: name, name, type: "n8n-nodes-base.httpRequest", typeVersion: 4.2, position,
  parameters: {
    method: "POST",
    url: urlExpr,
    sendHeaders: true,
    headerParameters: { parameters: [{ name: "Authorization", value: "=Bearer {{ $('Analisar evento').item.json.token }}" }] },
    sendBody: true,
    specifyBody: "json",
    jsonBody: bodyExpr,
  },
  ...extra,
});

const wf = {
  name: "Guria - Instagram comentário → DM",
  nodes: [
    { id: "wh-get", name: "Webhook verificação (GET)", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 0],
      webhookId: "guria-ig-get",
      parameters: { httpMethod: "GET", path: "instagram", responseMode: "responseNode" } },
    { id: "resp", name: "Responder desafio", type: "n8n-nodes-base.respondToWebhook", typeVersion: 1.1, position: [260, 0],
      parameters: { respondWith: "text",
        responseBody: "={{ $json.query['hub.verify_token'] === 'TROQUE_POR_UM_TOKEN_SECRETO' ? $json.query['hub.challenge'] : 'forbidden' }}" } },
    { id: "wh-post", name: "Webhook eventos (POST)", type: "n8n-nodes-base.webhook", typeVersion: 2, position: [0, 260],
      webhookId: "guria-ig-post",
      parameters: { httpMethod: "POST", path: "instagram", responseMode: "onReceived", options: { responseCode: 200 } } },
    { id: "code", name: "Analisar evento", type: "n8n-nodes-base.code", typeVersion: 2, position: [260, 260],
      parameters: { jsCode: code } },
    { id: "switch", name: "Tipo de evento", type: "n8n-nodes-base.switch", typeVersion: 3.2, position: [520, 260],
      parameters: { rules: { values: [
        { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
            conditions: [{ leftValue: "={{ $json.type }}", rightValue: "comment", operator: { type: "string", operation: "equals" } }] },
          renameOutput: true, outputKey: "comment" },
        { conditions: { options: { caseSensitive: true, typeValidation: "loose", version: 2 }, combinator: "and",
            conditions: [{ leftValue: "={{ $json.type }}", rightValue: "postback", operator: { type: "string", operation: "equals" } }] },
          renameOutput: true, outputKey: "postback" },
      ] } } },
    http("DM com botão (Private Reply)", [780, 160], "={{ $json.privateReplyUrl }}", "={{ JSON.stringify($json.privateReplyBody) }}"),
    http("Responder comentário", [1040, 160], "={{ $('Analisar evento').item.json.commentReplyUrl }}",
      "={{ JSON.stringify($('Analisar evento').item.json.commentReplyBody) }}", { onError: "continueRegularOutput" }),
    http("Enviar conteúdo", [780, 380], "={{ $json.sendUrl }}", "={{ JSON.stringify($json.sendBody) }}"),
    { id: "note", name: "Leia primeiro", type: "n8n-nodes-base.stickyNote", typeVersion: 1, position: [-20, -240],
      parameters: { width: 620, height: 200, content:
        "## Guria - Instagram\n1. Edite CONFIG no nó **Analisar evento** (ID da conta, token, regras).\n2. Troque TROQUE_POR_UM_TOKEN_SECRETO no nó **Responder desafio** e use o mesmo valor no painel da Meta.\n3. Ative o workflow e cadastre a URL de **produção** (…/webhook/instagram) na Meta; assine `comments` e `messages`.\n4. A anti-duplicata usa dados do workflow e só funciona com o workflow ATIVO." } },
  ],
  connections: {
    "Webhook verificação (GET)": { main: [[{ node: "Responder desafio", type: "main", index: 0 }]] },
    "Webhook eventos (POST)": { main: [[{ node: "Analisar evento", type: "main", index: 0 }]] },
    "Analisar evento": { main: [[{ node: "Tipo de evento", type: "main", index: 0 }]] },
    "Tipo de evento": { main: [
      [{ node: "DM com botão (Private Reply)", type: "main", index: 0 }],
      [{ node: "Enviar conteúdo", type: "main", index: 0 }],
    ] },
    "DM com botão (Private Reply)": { main: [[{ node: "Responder comentário", type: "main", index: 0 }]] },
  },
  settings: { executionOrder: "v1" },
};

writeFileSync(new URL("./workflow-instagram.json", import.meta.url), JSON.stringify(wf, null, 2) + "\n");
